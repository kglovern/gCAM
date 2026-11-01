const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Keep cut/skip phase continuous across vertices and preserve existing holding gaps. */
export function perforateLaserContour(
    points,
    cut,
    skip,
    pointBudget = 2000000,
) {
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    const total = lengths.reduce((n, length) => n + length, 0);
    if (points.length + 2 * Math.ceil(total / (cut + skip)) > pointBudget)
        throw new Error(
            'Laser perforation is too dense; increase cut/skip lengths or reduce passes.',
        );
    const result = [{ ...points[0] }];
    let offset = 0,
        next = cut,
        on = true;
    for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i],
            end = offset + length;
        if (length === 0) continue;
        const a = points[i],
            b = points[i + 1];
        while (next <= end) {
            const fraction = (next - offset) / length;
            result.push({
                x: a.x + fraction * (b.x - a.x),
                y: a.y + fraction * (b.y - a.y),
                power: on ? Math.max(0, Math.min(1, b.power ?? 1)) : 0,
            });
            on = !on;
            next += on ? cut : skip;
        }
        if (distance(result.at(-1), b) > 1e-10)
            result.push({
                ...b,
                power: on ? Math.max(0, Math.min(1, b.power ?? 1)) : 0,
            });
        offset = end;
    }
    if (points.length > 3 && distance(points[0], points.at(-1)) < 1e-7)
        result[0].power = result.at(-1).power;
    return result;
}
