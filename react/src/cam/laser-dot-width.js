/**
 * Shorten each continuous powered run symmetrically; retain tone changes and travel.
 * @param {Array<{x:number,y:number,power:number}>} points
 * @param {number} width
 * @param {number} maxPoints
 * @returns {Array<{x:number,y:number,power:number}>}
 */
export function correctLaserDots(points, width, maxPoints) {
    if (!width) return points;
    const result = [];
    const append = (x, y, power) => {
        if (result.length >= maxPoints)
            throw new Error(
                'Laser job is too large; reduce passes or increase interval.',
            );
        result.push({ x, y, power });
    };
    append(points[0].x, points[0].y, 0);
    for (let i = 1; i < points.length; i++) {
        if (!points[i].power) {
            append(points[i].x, points[i].y, 0);
            continue;
        }
        const start = points[i - 1];
        let last = i;
        while (last + 1 < points.length && points[last + 1].power > 0) last++;
        const end = points[last],
            length = Math.abs(end.x - start.x),
            direction = Math.sign(end.x - start.x);
        if (length > width + 1e-9) {
            append(start.x + (direction * width) / 2, start.y, 0);
            for (let n = i; n <= last; n++) {
                const distance = (points[n].x - start.x) * direction;
                if (distance <= width / 2) continue;
                append(
                    start.x +
                        direction * Math.min(distance, length - width / 2),
                    start.y,
                    points[n].power,
                );
                if (distance >= length - width / 2) break;
            }
        }
        append(end.x, end.y, 0);
        i = last;
    }
    return result;
}
