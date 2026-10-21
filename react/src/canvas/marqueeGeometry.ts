import type { Point } from './pointer/types';

/** Window selection encloses every vertex; crossing selection touches a segment. */
export function matchesMarquee(
    points: Point[],
    min: Point,
    max: Point,
    crossing: boolean,
): boolean {
    if (
        points.length < 2 ||
        !points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    )
        return false;
    const inside = (p: Point) =>
        p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
    if (!crossing) return points.every(inside);
    if (points.some(inside)) return true;
    // Clip each segment against the rectangle, including tangencies and edges.
    return points.slice(1).some((end, index) => {
        const start = points[index];
        const dx = end.x - start.x,
            dy = end.y - start.y;
        let enter = 0,
            exit = 1;
        for (const [p, q] of [
            [-dx, start.x - min.x],
            [dx, max.x - start.x],
            [-dy, start.y - min.y],
            [dy, max.y - start.y],
        ]) {
            if (p === 0) {
                if (q < 0) return false;
            } else if (p < 0) enter = Math.max(enter, q / p);
            else exit = Math.min(exit, q / p);
            if (enter > exit) return false;
        }
        return true;
    });
}
