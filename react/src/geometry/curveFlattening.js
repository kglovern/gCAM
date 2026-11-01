import { applyMatrixToPoint } from './matrix.js';
export const SVG_CURVE_TOLERANCE = 0.05;
const LIMIT = 1000000;
function validate(points, tolerance, budget) {
    if (
        !Number.isFinite(tolerance) ||
        tolerance <= 0 ||
        !Number.isInteger(budget) ||
        budget < 2 ||
        budget > LIMIT
    )
        throw new Error('Invalid curve tolerance or point budget.');
    for (const p of points) {
        if (
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.max(Math.abs(p.x), Math.abs(p.y)) * Number.EPSILON * 64 >
                tolerance / 4
        )
            throw new Error('Curve coordinates exceed tolerance precision.');
    }
}
function distanceToSegment(p, a, b) {
    const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
    if (!length) return Math.hypot(p.x - a.x, p.y - a.y);
    const projection = Math.max(
        0,
        Math.min(
            length,
            (p.x - a.x) * (dx / length) + (p.y - a.y) * (dy / length),
        ),
    );
    return Math.hypot(
        p.x - a.x - projection * (dx / length),
        p.y - a.y - projection * (dy / length),
    );
}
/** The Bezier convex hull stays inside the tolerance capsule around each accepted chord. */
export function flattenBezier(
    controls,
    tolerance = SVG_CURVE_TOLERANCE,
    budget = LIMIT,
) {
    validate(controls, tolerance, budget);
    if (controls.length !== 3 && controls.length !== 4)
        throw new Error('Expected quadratic or cubic controls.');
    const points = [controls[0]],
        pending = [{ controls, depth: 0 }];
    while (pending.length) {
        const { controls: c, depth } = pending.pop(),
            end = c[c.length - 1];
        if (
            c
                .slice(1, -1)
                .every((p) => distanceToSegment(p, c[0], end) <= tolerance / 2)
        ) {
            if (points.length >= budget)
                throw new Error(
                    'SVG path is too detailed; simplify the artwork.',
                );
            points.push(end);
            continue;
        }
        if (depth >= 32)
            throw new Error('Curve coordinates exceed tolerance precision.');
        let level = c;
        const left = [c[0]],
            right = [end];
        while (level.length > 1) {
            level = level.slice(1).map((p, i) => ({
                x: level[i].x / 2 + p.x / 2,
                y: level[i].y / 2 + p.y / 2,
            }));
            left.push(level[0]);
            right.push(level[level.length - 1]);
        }
        pending.push(
            { controls: right.reverse(), depth: depth + 1 },
            { controls: left, depth: depth + 1 },
        );
    }
    return points;
}
/** Linear interpolation error is bounded by max|p''(theta)| * deltaTheta^2 / 8. */
export function flattenEllipse(
    center,
    u,
    v,
    start,
    sweep,
    tolerance = SVG_CURVE_TOLERANCE,
    budget = LIMIT,
) {
    validate([center, u, v], tolerance, budget);
    if (
        !Number.isFinite(start) ||
        !Number.isFinite(sweep) ||
        Math.abs(sweep) > 2 * Math.PI + 1e-10
    )
        throw new Error('Invalid elliptical sweep.');
    const bound = Math.hypot(u.x, u.y, v.x, v.y);
    const steps = Math.max(
        Math.abs(sweep) > 2 * Math.PI - 1e-10 ? 4 : 1,
        Math.ceil(Math.abs(sweep) * Math.sqrt(bound / (4 * tolerance))),
    );
    if (!Number.isFinite(steps) || steps + 1 > budget)
        throw new Error('SVG path is too detailed; simplify the artwork.');
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const angle = start + (sweep * i) / steps;
        points.push({
            x: center.x + u.x * Math.cos(angle) + v.x * Math.sin(angle),
            y: center.y + u.y * Math.cos(angle) + v.y * Math.sin(angle),
        });
    }
    if (Math.abs(sweep) > 2 * Math.PI - 1e-10)
        points[points.length - 1] = { ...points[0] };
    validate(points, tolerance, budget);
    return points;
}
/** SVG endpoint-to-centre conversion follows W3C SVG implementation notes, B.2. */
export function flattenSvgArc(
    start,
    end,
    arc,
    matrix,
    tolerance = SVG_CURVE_TOLERANCE,
    budget = LIMIT,
) {
    const first = applyMatrixToPoint(start, matrix),
        last = applyMatrixToPoint(end, matrix);
    validate([first, last], tolerance, budget);
    let [rx, ry, rotation, large, sweep] = arc;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (
        ![rx, ry, rotation].every(Number.isFinite) ||
        ![0, 1].includes(large) ||
        ![0, 1].includes(sweep)
    )
        throw new Error('Invalid SVG elliptical arc.');
    if (!rx || !ry || (start.x === end.x && start.y === end.y))
        return [first, last];
    const phi = ((rotation % 360) * Math.PI) / 180,
        cos = Math.cos(phi),
        sin = Math.sin(phi);
    const dx = start.x / 2 - end.x / 2,
        dy = start.y / 2 - end.y / 2;
    const x = cos * dx + sin * dy,
        y = -sin * dx + cos * dy;
    const correction = Math.hypot(x / rx, y / ry);
    if (correction > 1) {
        rx *= correction;
        ry *= correction;
    }
    const nx = x / rx,
        ny = y / ry,
        q = nx * nx + ny * ny;
    const radiusBound =
        Math.max(rx, ry) * Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    const uncertainty =
        correction > 1 + 32 * Number.EPSILON
            ? 0
            : (radiusBound * 32 * Number.EPSILON) /
              Math.sqrt(Math.max(1 - q, Number.EPSILON));
    if (uncertainty > tolerance / 8)
        throw new Error('Arc coordinates exceed tolerance precision.');
    // Corrected radii produce an exact semicircle; avoid amplifying roundoff through sqrt(1-q).
    const factor =
        correction >= 1
            ? 0
            : (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - q) / q));
    const cx = factor * rx * ny,
        cy = -factor * ry * nx;
    const center = applyMatrixToPoint(
        {
            x: cos * cx - sin * cy + start.x / 2 + end.x / 2,
            y: sin * cx + cos * cy + start.y / 2 + end.y / 2,
        },
        matrix,
    );
    const u = {
        x: rx * (matrix.a * cos + matrix.c * sin),
        y: rx * (matrix.b * cos + matrix.d * sin),
    };
    const v = {
        x: ry * (-matrix.a * sin + matrix.c * cos),
        y: ry * (-matrix.b * sin + matrix.d * cos),
    };
    const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
    let delta = Math.atan2((-y - cy) / ry, (-x - cx) / rx) - angle;
    if (sweep && delta < 0) delta += 2 * Math.PI;
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    const points = flattenEllipse(
        center,
        u,
        v,
        angle,
        delta,
        tolerance,
        budget,
    );
    points[0] = first;
    points[points.length - 1] = last;
    return points;
}
