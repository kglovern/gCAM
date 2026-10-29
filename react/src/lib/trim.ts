/** Intersection-aware trimming of sampled vector paths. Coordinates are millimetres. */
export interface Point {
    x: number;
    y: number;
}
export interface TrimResult {
    before: Point[];
    after: Point[];
    removed: Point[];
    segmentIndex: number;
    distance: number;
}
const EPS = 1e-8;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function closestOnSegment(a: Point, b: Point, p: Point) {
    const dx = b.x - a.x,
        dy = b.y - a.y,
        length2 = dx * dx + dy * dy;
    const t = length2
        ? Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2),
          )
        : 0;
    return { t, distance: distance(p, { x: a.x + dx * t, y: a.y + dy * t }) };
}
export function segmentCrossings(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
): number[] {
    if (
        Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) ||
        Math.min(a.x, b.x) - EPS > Math.max(c.x, d.x) ||
        Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) ||
        Math.min(a.y, b.y) - EPS > Math.max(c.y, d.y)
    )
        return [];
    const dx = b.x - a.x,
        dy = b.y - a.y,
        ex = d.x - c.x,
        ey = d.y - c.y;
    const length = Math.hypot(dx, dy),
        otherLength = Math.hypot(ex, ey);
    if (length < EPS || otherLength < EPS) return [];
    const cx = c.x - a.x,
        cy = c.y - a.y,
        denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > 1e-12 * length * otherLength) {
        const t = (cx * ey - cy * ex) / denominator,
            u = (cx * dy - cy * dx) / denominator;
        const pt = EPS / length,
            pu = EPS / otherLength;
        return t >= -pt && t <= 1 + pt && u >= -pu && u <= 1 + pu
            ? [Math.max(0, Math.min(1, t))]
            : [];
    }
    if (Math.abs(cx * dy - cy * dx) > EPS * length) return [];
    const l2 = length * length,
        t0 = (cx * dx + cy * dy) / l2,
        t1 = ((d.x - a.x) * dx + (d.y - a.y) * dy) / l2;
    const lo = Math.max(0, Math.min(t0, t1)),
        hi = Math.min(1, Math.max(t0, t1));
    return hi >= lo ? [lo, hi] : [];
}

/** Remove the section bounded by actual intersections, not the curve's sampling vertices.
 * With no usable intersections, keep the existing single-edge trim behaviour. */
export function trimNearestSegment(
    points: Point[],
    click: Point,
    tolerance = Infinity,
    boundaries: Point[][] = [],
): TrimResult | null {
    if (points.length < 2) return null;
    const lengths = [0];
    let best = { segmentIndex: 0, distance: Infinity, position: 0 };
    for (let i = 0; i < points.length - 1; i++) {
        const length = distance(points[i], points[i + 1]);
        lengths.push(lengths[i] + length);
        if (length < EPS) continue;
        const hit = closestOnSegment(points[i], points[i + 1], click);
        if (hit.distance < best.distance)
            best = {
                segmentIndex: i,
                distance: hit.distance,
                position: lengths[i] + hit.t * length,
            };
    }
    const total = lengths[lengths.length - 1];
    if (
        best.distance > tolerance ||
        total < EPS ||
        !Number.isFinite(best.distance)
    )
        return null;
    const closed = distance(points[0], points[points.length - 1]) <= EPS;
    const cuts: number[] = [];
    for (const boundary of [
        points,
        ...boundaries.filter((path) => path !== points),
    ]) {
        for (let i = 0; i < points.length - 1; i++) {
            for (let j = 0; j < boundary.length - 1; j++) {
                if (
                    boundary === points &&
                    (Math.abs(i - j) <= 1 ||
                        (closed && Math.abs(i - j) === points.length - 2))
                )
                    continue;
                for (const t of segmentCrossings(
                    points[i],
                    points[i + 1],
                    boundary[j],
                    boundary[j + 1],
                )) {
                    const position =
                        lengths[i] + t * (lengths[i + 1] - lengths[i]);
                    cuts.push(closed && total - position <= EPS ? 0 : position);
                }
            }
        }
    }
    cuts.sort((a, b) => a - b);
    const unique = cuts.filter((v, i) => !i || v - cuts[i - 1] > EPS);
    const pointAt = (position: number): Point => {
        for (let i = 0; i < lengths.length - 1; i++) {
            const length = lengths[i + 1] - lengths[i];
            if (length > EPS && position <= lengths[i + 1]) {
                const t = Math.max(0, (position - lengths[i]) / length);
                return {
                    x: points[i].x + t * (points[i + 1].x - points[i].x),
                    y: points[i].y + t * (points[i + 1].y - points[i].y),
                };
            }
        }
        return { ...points[points.length - 1] };
    };
    const clean = (path: Point[]) =>
        path.filter((p, i) => !i || distance(p, path[i - 1]) > EPS);
    const slice = (start: number, end: number) =>
        clean([
            pointAt(start),
            ...points.filter(
                (_, i) => lengths[i] > start + EPS && lengths[i] < end - EPS,
            ),
            pointAt(end),
        ]);
    let start = lengths[best.segmentIndex],
        end = lengths[best.segmentIndex + 1];
    if (closed && unique.length >= 2) {
        const next = unique.findIndex((v) => v > best.position + EPS);
        start =
            next === 0
                ? unique[unique.length - 1] - total
                : next < 0
                  ? unique[unique.length - 1]
                  : unique[next - 1];
        end = next < 0 ? unique[0] + total : unique[next];
    } else if (!closed && unique.some((v) => v > EPS && v < total - EPS)) {
        const stops = [
            0,
            ...unique.filter((v) => v > EPS && v < total - EPS),
            total,
        ];
        const next = stops.findIndex((v) => v > best.position + EPS);
        const index = next < 0 ? stops.length - 1 : Math.max(1, next);
        start = stops[index - 1];
        end = stops[index];
    }
    const wrapSlice = (start: number, end: number) =>
        start < 0
            ? clean([...slice(start + total, total), ...slice(0, end)])
            : end > total
              ? clean([...slice(start, total), ...slice(0, end - total)])
              : slice(start, end);
    const removed = wrapSlice(start, end);
    if (closed) {
        const before =
            start < 0
                ? slice(end, start + total)
                : end > total
                  ? slice(end - total, start)
                  : clean([...slice(end, total), ...slice(0, start)]);
        return {
            before,
            after: [],
            removed,
            segmentIndex: best.segmentIndex,
            distance: best.distance,
        };
    }
    return {
        before: slice(0, start),
        after: slice(end, total),
        removed,
        segmentIndex: best.segmentIndex,
        distance: best.distance,
    };
}

interface TrimLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}
/** Pick once, then calculate intersections only for the nearest visible vector. */
export function findTrimTarget(
    loops: TrimLoop[],
    click: Point,
    tolerance = Infinity,
    selected: string[] = [],
    hidden: string[] = [],
) {
    const visible = loops.filter(
        (loop) => !loop.bitmapId && !hidden.includes(loop.id),
    );
    let best: { loop: TrimLoop; distance: number } | null = null;
    for (const loop of visible) {
        if (selected.length && !selected.includes(loop.id)) continue;
        for (let i = 0; i < loop.points.length - 1; i++) {
            if (distance(loop.points[i], loop.points[i + 1]) < EPS) continue;
            const hit = closestOnSegment(
                loop.points[i],
                loop.points[i + 1],
                click,
            );
            if (
                hit.distance <= tolerance &&
                (!best || hit.distance < best.distance)
            )
                best = { loop, distance: hit.distance };
        }
    }
    if (!best) return null;
    const result = trimNearestSegment(
        best.loop.points,
        click,
        tolerance,
        visible.map((loop) => loop.points),
    );
    return result ? { loopId: best.loop.id, ...result } : null;
}
