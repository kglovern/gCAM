const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Retrace the ordered contour's beginning, preserving its segment-ending powers. */
export function laserOvercutPoints(points, length, pointBudget = 2000000) {
    if (
        !length ||
        points.length < 4 ||
        distance(points[0], points.at(-1)) > 1e-7
    )
        return;
    const total = points
        .slice(1)
        .reduce((sum, p, i) => sum + distance(points[i], p), 0);
    if (length > total + 1e-9)
        throw new Error(
            'Laser overcut exceeds this outline perimeter; use additional passes instead.',
        );
    const result = [{ ...points.at(-1) }];
    let remaining = length;
    for (let i = 1; i < points.length && remaining > 1e-10; i++) {
        const a = result.at(-1),
            b = points[i],
            segment = distance(a, b);
        if (!segment) continue;
        if (result.length > pointBudget)
            throw new Error(
                'Laser overcut exceeds the job point budget; reduce overcut or passes.',
            );
        const fraction = Math.min(1, remaining / segment);
        result.push({
            ...b,
            x: a.x + (b.x - a.x) * fraction,
            y: a.y + (b.y - a.y) * fraction,
        });
        remaining -= segment * fraction;
    }
    return result;
}
