/**
 * Purpose: Implementation module for corners in the lib domain.
 */
export interface CornerPoint {
    x: number;
    y: number;
}

const sub = (a: CornerPoint, b: CornerPoint) => ({
    x: a.x - b.x,
    y: a.y - b.y,
});
const add = (a: CornerPoint, b: CornerPoint) => ({
    x: a.x + b.x,
    y: a.y + b.y,
});
const mul = (a: CornerPoint, s: number) => ({ x: a.x * s, y: a.y * s });
const len = (a: CornerPoint) => Math.hypot(a.x, a.y);
const norm = (a: CornerPoint) => {
    const l = len(a) || 1;
    return { x: a.x / l, y: a.y / l };
};

const isClosed = (points: CornerPoint[]) =>
    points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y;

/** Chamfer only the picked vertex, leaving every other corner unchanged. */
export function chamferCorner(
    points: CornerPoint[],
    index: number,
    distance: number,
): CornerPoint[] | null {
    const closed = isClosed(points);
    const ring = closed ? points.slice(0, -1) : points.slice();
    if (
        !(distance > 0) ||
        index < (closed ? 0 : 1) ||
        index >= ring.length - (closed ? 0 : 1)
    )
        return null;
    const prev = ring[(index - 1 + ring.length) % ring.length];
    const curr = ring[index];
    const next = ring[(index + 1) % ring.length];
    const edgeIn = len(sub(prev, curr)),
        edgeOut = len(sub(next, curr));
    if (distance >= edgeIn || distance >= edgeOut) return null;
    const a = norm(sub(prev, curr)),
        b = norm(sub(next, curr));
    if (Math.abs(a.x * b.y - a.y * b.x) < 1e-6) return null;
    const result = ring.flatMap((point, i) =>
        i === index
            ? [add(curr, mul(a, distance)), add(curr, mul(b, distance))]
            : [{ ...point }],
    );
    if (closed) result.push({ ...result[0] });
    return result;
}

/** Apply a tangent fillet to one vertex, matching CAM Canvas corner behavior. */
export function filletCorner(
    points: CornerPoint[],
    cornerIndex: number,
    radius: number,
): CornerPoint[] | null {
    if (points.length < 3 || !(radius > 0)) return null;
    const closed = isClosed(points);
    const ring = closed ? points.slice(0, -1) : points.slice();
    const index = Math.trunc(cornerIndex);
    const first = closed ? 0 : 1;
    const last = closed ? ring.length - 1 : ring.length - 2;
    if (index < first || index > last || ring.length < 3) return null;

    const prev = ring[(index - 1 + ring.length) % ring.length];
    const curr = ring[index];
    const next = ring[(index + 1) % ring.length];
    const left = len(sub(prev, curr));
    const right = len(sub(next, curr));
    if (!(left > 1e-9) || !(right > 1e-9)) return null;

    const towardPrevious = norm(sub(prev, curr));
    const towardNext = norm(sub(next, curr));
    const angle = Math.acos(
        Math.min(
            1,
            Math.max(
                -1,
                towardPrevious.x * towardNext.x +
                    towardPrevious.y * towardNext.y,
            ),
        ),
    );
    if (angle < 1e-6 || Math.PI - angle < 1e-6) return null;
    const effectiveRadius = radius;
    const trim = radius / Math.tan(angle / 2);
    if (!Number.isFinite(trim) || trim <= 1e-9 || trim >= left || trim >= right)
        return null;
    const a = add(curr, mul(towardPrevious, trim));
    const b = add(curr, mul(towardNext, trim));
    const bisector = norm(add(towardPrevious, towardNext));
    const center = add(
        curr,
        mul(bisector, effectiveRadius / Math.sin(angle / 2)),
    );
    const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
    const endAngle = Math.atan2(b.y - center.y, b.x - center.x);
    let sweep = endAngle - startAngle;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;

    const out: CornerPoint[] = [];
    for (let i = 0; i < ring.length; i += 1) {
        if (i !== index) {
            out.push({ ...ring[i] });
            continue;
        }
        out.push(a);
        for (let segment = 1; segment < 8; segment += 1) {
            const theta = startAngle + (sweep * segment) / 8;
            out.push({
                x: center.x + Math.cos(theta) * effectiveRadius,
                y: center.y + Math.sin(theta) * effectiveRadius,
            });
        }
        out.push(b);
    }
    if (closed) out.push({ ...out[0] });
    return out;
}

/** Discard duplicate/straight samples without changing the imported outline. */
function cleanDogboneCorner(points: CornerPoint[], index: number) {
    const picked = points[index];
    if (!picked) return null;
    const ring = points.filter(
        (point, i) => !i || len(sub(point, points[i - 1])) > 1e-8,
    );
    const closed =
        ring.length > 1 && len(sub(ring[0], ring[ring.length - 1])) < 1e-8;
    if (closed) ring.pop();
    const clean = ring.filter((point, i) => {
        if (!closed && (i === 0 || i === ring.length - 1)) return true;
        const a = sub(point, ring[(i + ring.length - 1) % ring.length]);
        const b = sub(ring[(i + 1) % ring.length], point);
        return (
            Math.abs(a.x * b.y - a.y * b.x) > 1e-8 * len(a) * len(b) ||
            a.x * b.x + a.y * b.y < 0
        );
    });
    const cornerIndex = clean.findIndex(
        (point) => len(sub(point, picked)) < 1e-8,
    );
    if (cornerIndex < 0 || clean.length < 3) return null;
    return {
        points: closed ? [...clean, { ...clean[0] }] : clean,
        cornerIndex,
    };
}

/** Build the dogbone relief circle for one hovered corner. */
export function dogboneCorner(
    points: CornerPoint[],
    cornerIndex: number,
    toolRadius: number,
    segments = 24,
): CornerPoint[] | null {
    const cleaned = cleanDogboneCorner(points, cornerIndex);
    if (!cleaned) return null;
    points = cleaned.points;
    cornerIndex = cleaned.cornerIndex;

    if (points.length < 3 || !(toolRadius > 0)) return null;
    const closed = isClosed(points);
    const ring = closed ? points.slice(0, -1) : points.slice();
    const index = Math.trunc(cornerIndex);
    const first = closed ? 0 : 1;
    const last = closed ? ring.length - 1 : ring.length - 2;
    if (index < first || index > last) return null;
    const curr = ring[index];
    const prev = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const toPrevious = norm(sub(prev, curr));
    const toNext = norm(sub(next, curr));
    const edgeIn = len(sub(prev, curr));
    const edgeOut = len(sub(next, curr));
    if (!(edgeIn > 1e-9) || !(edgeOut > 1e-9)) return null;
    const bisector = add(toPrevious, toNext);
    const bisectorLength = len(bisector);
    if (bisectorLength < 1e-6) return null;
    const radius = Math.min(toolRadius, edgeIn / 2, edgeOut / 2);
    const center = add(curr, mul(bisector, radius / bisectorLength));
    return Array.from({ length: segments + 1 }, (_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        return {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
        };
    });
}

/** Replace a picked corner with the exposed arc of its existing relief circle. */
export function dogboneReliefCorner(
    points: CornerPoint[],
    cornerIndex: number,
    toolRadius: number,
): CornerPoint[] | null {
    const cleaned = cleanDogboneCorner(points, cornerIndex);
    if (!cleaned) return null;
    points = cleaned.points;
    cornerIndex = cleaned.cornerIndex;

    const circle = dogboneCorner(points, cornerIndex, toolRadius);
    if (!circle) return null;
    const closed = isClosed(points);
    const ring = closed ? points.slice(0, -1) : points.slice();
    const index = Math.trunc(cornerIndex);
    const corner = ring[index];
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const u = norm(sub(previous, corner)),
        v = norm(sub(next, corner));
    if (Math.abs(u.x * v.y - u.y * v.x) < 1e-6) return null;
    const center = mul(add(circle[0], circle[(circle.length - 1) / 2]), 0.5);
    const radius = len(sub(circle[0], center));
    const offset = sub(center, corner);
    // The circle passes through the corner; these are its other edge crossings.
    const a = add(corner, mul(u, 2 * (offset.x * u.x + offset.y * u.y)));
    const b = add(corner, mul(v, 2 * (offset.x * v.x + offset.y * v.y)));
    const start = Math.atan2(a.y - center.y, a.x - center.x);
    const end = Math.atan2(b.y - center.y, b.x - center.x);
    const through = Math.atan2(corner.y - center.y, corner.x - center.x);
    const turn = Math.PI * 2;
    const positive = (angle: number) => ((angle % turn) + turn) % turn;
    const ccw = positive(end - start);
    const sweep = positive(through - start) <= ccw + 1e-9 ? ccw : ccw - turn;
    const count = Math.max(
        12,
        Math.ceil(
            Math.abs(sweep) / (2 * Math.acos(1 - Math.min(0.01 / radius, 1))),
        ),
    );
    const arc = Array.from({ length: count + 1 }, (_, i) => {
        const angle = start + (sweep * i) / count;
        return {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
        };
    });
    arc[0] = a;
    arc[count] = b;
    const result = ring.flatMap((point, i) =>
        i === index ? arc : [{ ...point }],
    );
    if (closed) result.push({ ...result[0] });
    return result;
}

/**
 * Round the sharp corners of a closed loop with tangent arcs (8 segments).
 * Vertices that can't fit the radius are left sharp.
 */
export function filletLoop(
    points: CornerPoint[],
    radius: number,
): CornerPoint[] {
    if (points.length < 4 || !(radius > 0)) return points;
    const closed = isClosed(points);
    const ring = closed ? points.slice(0, -1) : points.slice();
    if (ring.length < 3) return points;
    const out: CornerPoint[] = [];
    for (let i = 0; i < ring.length; i += 1) {
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const curr = ring[i];
        const next = ring[(i + 1) % ring.length];
        const towardPrevious = norm(sub(prev, curr));
        const towardNext = norm(sub(next, curr));
        const angle = Math.acos(
            Math.min(
                1,
                Math.max(
                    -1,
                    towardPrevious.x * towardNext.x +
                        towardPrevious.y * towardNext.y,
                ),
            ),
        );
        if (angle < 1e-6 || Math.PI - angle < 1e-6) {
            out.push(curr);
            continue;
        }
        const edgeIn = len(sub(curr, prev));
        const edgeOut = len(sub(next, curr));
        const effectiveRadius = Math.min(radius, edgeIn / 2, edgeOut / 2);
        const dist = effectiveRadius / Math.tan(angle / 2);
        if (dist > edgeIn / 2 || dist > edgeOut / 2) {
            out.push(curr);
            continue;
        }
        const t1 = add(curr, mul(towardPrevious, dist));
        const t2 = add(curr, mul(towardNext, dist));
        // Arc center along the angle bisector.
        const bisector = norm(add(towardPrevious, towardNext));
        const center = add(
            curr,
            mul(bisector, effectiveRadius / Math.sin(angle / 2)),
        );
        const a0 = Math.atan2(t1.y - center.y, t1.x - center.x);
        let a1 = Math.atan2(t2.y - center.y, t2.x - center.x);
        // Sweep the short way through the corner.
        let sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        while (sweep < -Math.PI) sweep += Math.PI * 2;
        out.push(t1);
        for (let s = 1; s < 8; s += 1) {
            const a = a0 + (sweep * s) / 8;
            out.push({
                x: center.x + Math.cos(a) * effectiveRadius,
                y: center.y + Math.sin(a) * effectiveRadius,
            });
        }
        out.push(t2);
    }
    if (closed) out.push({ ...out[0] });
    return out;
}

/**
 * Replace eligible sharp corners with a straight chamfer between the two
 * offset points on the adjacent edges.  Corners that cannot fit are kept.
 */
export function chamferLoop(
    points: CornerPoint[],
    distance: number,
): CornerPoint[] {
    if (points.length < 4 || !(distance > 0)) return points;
    const closed =
        points[0].x === points[points.length - 1].x &&
        points[0].y === points[points.length - 1].y;
    const ring = closed ? points.slice(0, -1) : points.slice();
    if (ring.length < 3) return points;
    const out: CornerPoint[] = [];
    for (let i = 0; i < ring.length; i += 1) {
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const curr = ring[i];
        const next = ring[(i + 1) % ring.length];
        const incoming = sub(curr, prev);
        const outgoing = sub(next, curr);
        const edgeIn = len(incoming);
        const edgeOut = len(outgoing);
        const inDir = norm(incoming);
        const outDir = norm(outgoing);
        const dot = inDir.x * outDir.x + inDir.y * outDir.y;
        if (edgeIn <= 0 || edgeOut <= 0 || dot < -0.98 || dot > 0.999) {
            out.push(curr);
            continue;
        }
        const cut = Math.min(distance, edgeIn / 2, edgeOut / 2);
        if (!(cut > 0)) {
            out.push(curr);
            continue;
        }
        out.push(sub(curr, mul(inDir, cut)), add(curr, mul(outDir, cut)));
    }
    if (closed && out.length) out.push({ ...out[0] });
    return out;
}

/**
 * Classic dogbone: add a tool-radius circle at meaningful sharp corners so a
 * mating part with square edges fits. Nearly-collinear points are ignored;
 * this prevents dense DXF/polyline curves from becoming a ball of circles.
 */
export function dogboneLoops(
    points: CornerPoint[],
    toolRadius: number,
    segments = 24,
): CornerPoint[][] {
    if (points.length < 3 || !(toolRadius > 0)) return [];
    const closed =
        points[0].x === points[points.length - 1].x &&
        points[0].y === points[points.length - 1].y;
    const ring = closed ? points.slice(0, -1) : points.slice();
    const circles: CornerPoint[][] = [];
    for (let i = 0; i < ring.length; i += 1) {
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const curr = ring[i];
        const next = ring[(i + 1) % ring.length];
        const toPrev = norm(sub(prev, curr));
        const toNext = norm(sub(next, curr));
        const edgeIn = len(sub(prev, curr));
        const edgeOut = len(sub(next, curr));
        const cornerDot = toPrev.x * toNext.x + toPrev.y * toNext.y;
        if (cornerDot < -0.98 || edgeIn <= 0 || edgeOut <= 0) continue;

        const bisector = add(toPrev, toNext);
        const bisectorLength = len(bisector);
        if (bisectorLength < 1e-6) continue;
        const radius = Math.min(toolRadius, edgeIn / 2, edgeOut / 2);
        if (!(radius > 0)) continue;
        const center = add(curr, mul(bisector, radius / bisectorLength));
        const pts: CornerPoint[] = [];
        for (let i = 0; i <= segments; i += 1) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: center.x + Math.cos(a) * radius,
                y: center.y + Math.sin(a) * radius,
            });
        }
        circles.push(pts);
    }
    return circles;
}
