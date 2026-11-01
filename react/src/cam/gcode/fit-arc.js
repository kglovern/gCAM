import { formatNumber } from './format.js';

const round = (value) => Number(formatNumber(value));
const tolerance = 0.02;

function candidate(points, start, end) {
    const a = points[start];
    const b = points[Math.floor((start + end) / 2)];
    const c = points[end];
    const bx = b.x - a.x,
        by = b.y - a.y;
    const cx = c.x - a.x,
        cy = c.y - a.y;
    const determinant = 2 * (bx * cy - by * cx);
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10)
        return null;
    const b2 = bx * bx + by * by,
        c2 = cx * cx + cy * cy;
    const i = round((cy * b2 - by * c2) / determinant);
    const j = round((bx * c2 - cx * b2) / determinant);
    const center = { x: round(a.x) + i, y: round(a.y) + j };
    const radius = Math.hypot(i, j);
    if (!Number.isFinite(radius) || radius < 0.001 || radius > 1e6) return null;
    if (
        Math.abs(
            Math.hypot(round(c.x) - center.x, round(c.y) - center.y) - radius,
        ) > 0.0002
    )
        return null;
    let sweep = 0;
    let direction = 0;
    const power = points[start + 1].power;
    for (let index = start; index <= end; index++) {
        const point = points[index];
        if (index > start && point.power !== power) return null;
        const x = point.x - center.x,
            y = point.y - center.y;
        if (Math.abs(Math.hypot(x, y) - radius) > tolerance - 0.0002)
            return null;
        if (index === start) continue;
        const previous = points[index - 1];
        const ax = previous.x - center.x,
            ay = previous.y - center.y;
        const angle = Math.atan2(ax * y - ay * x, ax * x + ay * y);
        if (!Number.isFinite(angle)) return null;
        if (Math.abs(angle) < 1e-12) {
            if (Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-8)
                return null;
            continue;
        }
        if (direction && Math.sign(angle) !== direction) return null;
        direction = Math.sign(angle);
        sweep += angle;
        if (Math.abs(sweep) > Math.PI + 1e-9) return null;
        const dx = point.x - previous.x,
            dy = point.y - previous.y;
        const t = Math.max(
            0,
            Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)),
        );
        // The nearest point of each chord bounds its inward deviation too.
        if (radius - Math.hypot(ax + t * dx, ay + t * dy) > tolerance - 0.0002)
            return null;
    }
    if (Math.abs(sweep) < 0.0001) return null;
    return { end, i, j, command: direction > 0 ? 'G3' : 'G2' };
}

/** Bounded circular runs; all unproven geometry remains linear. */
export function fitArcRun(points, start) {
    const limit = Math.min(points.length - 1, start + 1024);
    if (limit - start < 4) return null;
    let end = start + 4;
    let best = candidate(points, start, end);
    if (!best) return null;
    while (end < limit) {
        end = Math.min(limit, start + (end - start) * 2);
        const next = candidate(points, start, end);
        if (!next) break;
        best = next;
    }
    return best;
}
