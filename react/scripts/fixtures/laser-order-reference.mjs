// Frozen pre-optimization routing for exact-output comparison in tests and benchmarks.
import { perforateLaserContour } from '../../src/cam/laser-perforation.js';
import { bridgeLaserContour } from '../../src/cam/laser-bridges.js';
import { boundsOfPoints } from '../../src/geometry/bounds.js';
import { pointInPolygon } from '../../src/cam/geometry/polygons.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const closed = (p) => p.length > 3 && distance(p[0], p.at(-1)) < 1e-7;
const cross = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onEdge = (p, a, b) =>
    Math.abs(cross(a, b, p)) < 1e-9 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);

function contains(outer, inner) {
    if (!closed(outer.points)) return false;
    const a = outer.bounds,
        b = inner.bounds;
    if (
        b.minX < a.minX ||
        b.maxX > a.maxX ||
        b.minY < a.minY ||
        b.maxY > a.maxY
    )
        return false;
    const ring = outer.points;
    if (
        !inner.points.every(
            (p) =>
                pointInPolygon(p, ring) &&
                !ring.some((a, i) => i > 0 && onEdge(p, ring[i - 1], a)),
        )
    )
        return false;
    // Vertices alone miss edges that leave a concave enclosing outline.
    for (let i = 1; i < inner.points.length; i++)
        for (let j = 1; j < ring.length; j++) {
            const a = inner.points[i - 1],
                b = inner.points[i],
                c = ring[j - 1],
                d = ring[j];
            if (
                cross(a, b, c) * cross(a, b, d) < -1e-12 &&
                cross(c, d, a) * cross(c, d, b) < -1e-12
            )
                return false;
            if (onEdge(c, a, b) || onEdge(d, a, b)) return false;
        }
    return true;
}

export function laserTravel(paths, start = { x: 0, y: 0 }) {
    let length = 0,
        cursor = start;
    for (const path of paths) {
        length += distance(cursor, path.points[0]);
        cursor = path.points.at(-1);
    }
    return length;
}

// Assign bridge boundaries before choosing starts, so travel ordering cannot move the gaps.
export function orderLaserCuts(
    paths,
    {
        innerFirst,
        optimizeTravel,
        perforation = false,
        perforationCut = 2,
        perforationSkip = 1,
        bridges = false,
        bridgeCount = 4,
        bridgeWidth = 0.5,
        bridgeSkipInner = true,
        ...bridgeOptions
    },
    pointBudget = 2000000,
) {
    const nodes = paths.map((path) => ({
        ...path,
        bounds: boundsOfPoints(path.points),
    }));
    const children = nodes.map((outer, i) =>
        innerFirst
            ? nodes.flatMap((inner, j) =>
                  i !== j && contains(outer, inner) ? [j] : [],
              )
            : [],
    );
    let pointCount = nodes.reduce((sum, node) => sum + node.points.length, 0);
    if (bridges)
        for (let i = 0; i < nodes.length; i++) {
            const inner =
                bridgeSkipInner &&
                nodes.some(
                    (outer, j) =>
                        i !== j &&
                        (innerFirst
                            ? children[j].includes(i)
                            : contains(outer, nodes[i])),
                );
            if (!inner) {
                const previousCount = nodes[i].points.length;
                nodes[i].points = bridgeLaserContour(
                    nodes[i].points,
                    bridgeCount,
                    bridgeWidth,
                    bridgeOptions,
                    pointBudget - pointCount + previousCount,
                );
                pointCount += nodes[i].points.length - previousCount;
            }
        }
    if (perforation)
        for (const node of nodes) {
            const previousCount = node.points.length;
            node.points = perforateLaserContour(
                node.points,
                perforationCut,
                perforationSkip,
                pointBudget - pointCount + previousCount,
            );
            pointCount += node.points.length - previousCount;
        }
    function arrange(nearest) {
        const remaining = new Set(nodes.map((_, i) => i)),
            result = [];
        let cursor = { x: 0, y: 0 };
        while (remaining.size) {
            let choice,
                best = Infinity;
            for (const i of remaining) {
                if (children[i].some((j) => remaining.has(j))) continue;
                const points = nodes[i].points,
                    ring = closed(points);
                const candidates = nearest
                    ? ring
                        ? points.slice(0, -1).map((_, k) => k)
                        : [0, points.length - 1]
                    : [0];
                for (const k of candidates) {
                    const d = distance(cursor, points[k]);
                    if (d < best) {
                        best = d;
                        choice = { i, k, ring };
                    }
                }
                if (!nearest) break;
            }
            if (!choice)
                throw new Error('Laser cut containment could not be resolved.');
            const { i, k, ring } = choice,
                node = nodes[i];
            let points = node.points;
            if (k)
                points = ring
                    ? [...points.slice(k, -1), ...points.slice(0, k), points[k]]
                    : points.slice().reverse();
            if (k && !ring && perforation)
                points = points.map((p, i) => ({
                    ...p,
                    power: i
                        ? node.points[node.points.length - i].power
                        : undefined,
                }));
            result.push({ ...paths[i], points });
            cursor = points.at(-1);
            remaining.delete(i);
        }
        return result;
    }
    const original = arrange(false);
    if (!optimizeTravel) return original;
    // shortcut: greedy ordering, revisit with local search if matched benchmarks warrant it.
    const optimized = arrange(true);
    return laserTravel(optimized) < laserTravel(original)
        ? optimized
        : original;
}
