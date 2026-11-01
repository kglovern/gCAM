import { laserTravel, refineLaserRoute } from './laser-travel.js';
export { laserTravel } from './laser-travel.js';
import { perforateLaserContour } from './laser-perforation.js';
import { bridgeLaserContour } from './laser-bridges.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import { pointInPolygon } from './geometry/polygons.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const closed = (p) => p.length > 3 && distance(p[0], p.at(-1)) < 1e-7;
const cutting = (point) => point.power === undefined || point.power >= 1;
const cross = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onEdge = (p, a, b) =>
    Math.abs(cross(a, b, p)) < 1e-9 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);

function poweredCorners(points) {
    if (!closed(points)) return null;
    const unique = [];
    for (let k = 0; k < points.length - 1; k++)
        if (
            !unique.length ||
            distance(points[k], points[unique.at(-1)]) > 1e-10
        )
            unique.push(k);
    if (
        unique.length > 1 &&
        distance(points[unique[0]], points[unique.at(-1)]) < 1e-10
    )
        unique.pop();
    if (unique.length < 3) return null;
    const corners = unique.filter((k, i) => {
        if (!cutting(points[k]) || !cutting(points[k + 1])) return false;
        const a = points[unique[(i + unique.length - 1) % unique.length]],
            b = points[k],
            c = points[unique[(i + 1) % unique.length]],
            ux = b.x - a.x,
            uy = b.y - a.y,
            vx = c.x - b.x,
            vy = c.y - b.y;
        // Prefer a turn of at least 45 degrees; sampled smooth curves fall back to normal starts.
        return (
            (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) <=
            Math.SQRT1_2 + 1e-12
        );
    });
    return corners.length ? corners : null;
}

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

// Assign bridge boundaries before choosing starts, so travel ordering cannot move the gaps.
export function orderLaserCuts(
    paths,
    {
        innerFirst,
        optimizeTravel,
        cutOrder = 'none',
        preferCornerStarts = false,
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
    preserveLegacyManualOrder = false,
) {
    if (typeof preferCornerStarts !== 'boolean')
        throw new Error('Invalid laser corner-start preference.');
    if (
        ![
            'none',
            'left-to-right',
            'right-to-left',
            'top-to-bottom',
            'bottom-to-top',
        ].includes(cutOrder)
    )
        throw new Error('Invalid laser cut order.');
    const nodes = paths.map((path) => ({
        ...path,
        bounds: boundsOfPoints(path.points),
    }));
    const directionRanks =
        cutOrder === 'none'
            ? null
            : nodes.map(({ bounds: b }) =>
                  cutOrder === 'left-to-right'
                      ? (b.minX + b.maxX) / 2
                      : cutOrder === 'right-to-left'
                        ? -(b.minX + b.maxX) / 2
                        : cutOrder === 'bottom-to-top'
                          ? (b.minY + b.maxY) / 2
                          : -(b.minY + b.maxY) / 2,
              );
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
    const leadsEnabled =
        (bridgeOptions.leadInLength ?? 0) > 0 ||
        (bridgeOptions.leadOutLength ?? 0) > 0;
    if (leadsEnabled) {
        const depths = new Map();
        function depth(i) {
            if (depths.has(i)) return depths.get(i);
            let value = 0;
            for (let j = 0; j < nodes.length; j++)
                if (
                    i !== j &&
                    (innerFirst
                        ? children[j].includes(i)
                        : contains(nodes[j], nodes[i]))
                )
                    value = Math.max(value, depth(j) + 1);
            depths.set(i, value);
            return value;
        }
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            node.laserLeadInside = depth(i) % 2 === 1;
            const points = node.points;
            if (closed(points)) {
                // A lead must join a powered run, never the middle of a holding gap.
                if (
                    !points
                        .slice(0, -1)
                        .some((p, k) => cutting(p) && cutting(points[k + 1]))
                ) {
                    let longest = 0,
                        segment = -1;
                    for (let k = 1; k < points.length; k++)
                        if (
                            cutting(points[k]) &&
                            distance(points[k - 1], points[k]) > longest
                        ) {
                            longest = distance(points[k - 1], points[k]);
                            segment = k;
                        }
                    if (segment < 0)
                        throw new Error(
                            'Laser leads need a powered cutting segment.',
                        );
                    if (++pointCount > pointBudget)
                        throw new Error(
                            'Laser leads exceed the job point budget.',
                        );
                    const a = points[segment - 1],
                        b = points[segment];
                    node.points = [
                        ...points.slice(0, segment),
                        {
                            x: (a.x + b.x) / 2,
                            y: (a.y + b.y) / 2,
                            power: b.power,
                        },
                        ...points.slice(segment),
                    ];
                }
            } else {
                let first = 0,
                    last = points.length - 1;
                while (first < last && !cutting(points[first + 1])) first++;
                while (last > first && !cutting(points[last])) last--;
                if (first === last)
                    throw new Error(
                        'Laser leads need a powered cutting segment.',
                    );
                node.points = points.slice(first, last + 1);
                pointCount += node.points.length - points.length;
            }
        }
    }
    const cornerStarts = preferCornerStarts
        ? nodes.map((node) => poweredCorners(node.points))
        : null;
    function arrange(nearest) {
        const remaining = new Set(nodes.map((_, i) => i)),
            result = [],
            indices = [];
        let cursor = { x: 0, y: 0 };
        while (remaining.size) {
            let choice,
                best = Infinity,
                bestDirection = Infinity;
            for (const i of remaining) {
                if (children[i].some((j) => remaining.has(j))) continue;
                const node = nodes[i];
                const b = node.bounds;
                if (directionRanks) {
                    const direction = directionRanks[i];
                    if (direction > bestDirection) continue;
                    if (direction < bestDirection) {
                        best = Infinity;
                        bestDirection = direction;
                        choice = undefined;
                    }
                    if (!nearest && choice) continue;
                }
                if (nearest) {
                    // A contour cannot beat a nearer vertex when its entire box is farther away.
                    const lower = Math.hypot(
                        Math.max(b.minX - cursor.x, 0, cursor.x - b.maxX),
                        Math.max(b.minY - cursor.y, 0, cursor.y - b.maxY),
                    );
                    if (lower > best + 1e-9) continue;
                }
                const points = node.points,
                    ring = closed(points),
                    starts = cornerStarts?.[i];
                const count = starts
                    ? starts.length
                    : ring && leadsEnabled
                      ? points.length - 1
                      : !nearest
                        ? 1
                        : ring
                          ? points.length - 1
                          : 2;
                for (let candidate = 0; candidate < count; candidate++) {
                    const k = starts
                        ? starts[candidate]
                        : nearest && !ring && candidate
                          ? points.length - 1
                          : candidate;
                    if (
                        leadsEnabled &&
                        ring &&
                        (!cutting(points[k]) || !cutting(points[k + 1]))
                    )
                        continue;
                    const d = distance(cursor, points[k]);
                    if (d < best) {
                        best = d;
                        choice = { i, k, ring };
                    }
                    if (!nearest) break;
                }
                if (!nearest && cutOrder === 'none') break;
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
            result.push({
                ...paths[i],
                points,
                ...(leadsEnabled
                    ? { laserLeadInside: node.laserLeadInside }
                    : {}),
            });
            cursor = points.at(-1);
            indices.push(i);
            remaining.delete(i);
        }
        return { paths: result, indices };
    }
    const original = arrange(false);
    if (!optimizeTravel) return original.paths;
    const optimized = arrange(true);
    if (preserveLegacyManualOrder) {
        // Index-only manual bridges refer to the previous, single-pass greedy route.
        const legacy = {
            leadInLength: bridgeOptions.leadInLength,
            leadOutLength: bridgeOptions.leadOutLength,
            leadInAngle: bridgeOptions.leadInAngle,
            leadOutAngle: bridgeOptions.leadOutAngle,
        };
        return laserTravel(optimized.paths, undefined, legacy) <
            laserTravel(original.paths, undefined, legacy)
            ? optimized.paths
            : original.paths;
    }
    const best =
        laserTravel(optimized.paths, undefined, bridgeOptions) <
        laserTravel(original.paths, undefined, bridgeOptions)
            ? optimized
            : original;
    return refineLaserRoute(best, children, directionRanks, bridgeOptions)
        .paths;
}
