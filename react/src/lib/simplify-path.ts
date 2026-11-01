type Point = { x: number; y: number };

/** Iterative line fitting; callers validate coordinates and share a work budget. */
export function simplifyPath(
    points: Point[],
    tolerance: number,
    check: () => void,
) {
    if (points.length < 3) return points;
    const closed =
        Math.hypot(
            points[0].x - points[points.length - 1].x,
            points[0].y - points[points.length - 1].y,
        ) <= 1e-7;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const pending = [[0, points.length - 1]];
    while (pending.length) {
        const [first, last] = pending.pop()!;
        if (last - first < 2) continue;
        const a = points[first],
            b = points[last],
            dx = b.x - a.x,
            dy = b.y - a.y,
            length2 = dx * dx + dy * dy;
        let split = -1,
            worst = tolerance * tolerance,
            previousProjection = 0;
        for (let i = first + 1; i < last; i++) {
            check();
            const x = points[i].x - a.x,
                y = points[i].y - a.y;
            const projection = length2 ? (x * dx + y * dy) / length2 : 0;
            const t = Math.max(0, Math.min(1, projection));
            const distance2 = (x - t * dx) ** 2 + (y - t * dy) ** 2;
            if (distance2 > worst) {
                worst = distance2;
                split = i;
            }
            // Keep reversals and loops, even when their width is below tolerance.
            if (projection <= previousProjection || projection >= 1) {
                if (split < 0) split = i;
            }
            previousProjection = projection;
        }
        if (split >= 0) {
            keep[split] = 1;
            pending.push([first, split], [split, last]);
        }
    }
    const result = points.filter((_, i) => keep[i]);
    if (closed) {
        const area = (p: Point[]) => {
            let sum = 0;
            const origin = p[0];
            for (let i = 1; i < p.length; i++)
                sum +=
                    (p[i - 1].x - origin.x) * (p[i].y - origin.y) -
                    (p[i].x - origin.x) * (p[i - 1].y - origin.y);
            return sum;
        };
        if (
            result.length < 4 ||
            !area(result) ||
            Math.sign(area(result)) !== Math.sign(area(points))
        )
            return points;
    }
    return result.length < points.length ? result : points;
}
