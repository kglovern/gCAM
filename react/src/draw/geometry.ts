/**
 * Purpose: Implementation module for geometry in the draw domain.
 */
export type DrawTool =
    | 'line'
    | 'rectangle'
    | 'polygon'
    | 'circle'
    | 'arc'
    | 'bezier'
    | 'polyline'
    | 'text'
    | 'mandala'
    | null;

export interface Draft {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}

export interface DraftPoint {
    x: number;
    y: number;
}

/** Default arc control point offset to the left of the start-to-end chord. */
export function defaultArcBulgePoint(
    start: DraftPoint,
    end: DraftPoint,
): DraftPoint {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-8) return { ...end };
    const height = Math.max(length * 0.2, 1);
    return {
        x: (start.x + end.x) / 2 - (dy / length) * height,
        y: (start.y + end.y) / 2 + (dx / length) * height,
    };
}

/** Perpendicular distance of a bulge point from the chord. */
export function arcBulgeDistance(
    start: DraftPoint,
    end: DraftPoint,
    bulge: DraftPoint,
): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-8) return 0;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return (
        Math.abs(dx * (bulge.y - midpoint.y) - dy * (bulge.x - midpoint.x)) /
        chord
    );
}

/** Included angle in degrees represented by chord and sagitta. */
export function arcSweepDegrees(
    start: DraftPoint,
    end: DraftPoint,
    bulge: DraftPoint,
): number {
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (chord < 1e-8) return 0;
    return (
        (4 *
            Math.atan((2 * arcBulgeDistance(start, end, bulge)) / chord) *
            180) /
        Math.PI
    );
}

/** Shape points for a click-click draft, snapped to grid (or 0.1mm).
 *  Null when degenerate. Semantics mirror camcanvas: rectangle takes
 *  opposite corners; circle/polygon take center + edge. */
export function draftPoints(
    tool: DrawTool,
    draft: Draft | null,
    sides = 6,
    gridMm: number | null = null,
    polygonMode: 'inscribed' | 'circumscribed' = 'inscribed',
): DraftPoint[] | null {
    if (!tool || !draft) return null;
    const step = gridMm != null && gridMm > 0 ? gridMm : 0.1;
    const snap = (v: number) => {
        const rounded = Math.round(v / step) * step;
        return rounded === 0 ? 0 : rounded;
    };
    const clean = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
    const ax = snap(draft.ax);
    const ay = snap(draft.ay);
    const bx = snap(draft.bx);
    const by = snap(draft.by);
    if (Math.hypot(bx - ax, by - ay) < 0.5) return null;
    if (tool === 'line')
        return [
            { x: ax, y: ay },
            { x: bx, y: by },
        ];
    if (tool === 'rectangle') {
        const x0 = Math.min(ax, bx);
        const x1 = Math.max(ax, bx);
        const y0 = Math.min(ay, by);
        const y1 = Math.max(ay, by);
        return [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
            { x: x0, y: y0 },
        ];
    }
    // Center (a) + edge (b), like camcanvas click-click drawing.
    const r = Math.hypot(bx - ax, by - ay);
    if (tool === 'polygon') {
        const n = Math.min(128, Math.max(3, Math.round(sides)));
        const base = Math.atan2(by - ay, bx - ax);
        const vertexRadius =
            polygonMode === 'circumscribed' ? r / Math.cos(Math.PI / n) : r;
        const firstAngle =
            base + (polygonMode === 'circumscribed' ? Math.PI / n : 0);
        const pts: DraftPoint[] = [];
        for (let i = 0; i < n; i += 1) {
            const a = firstAngle + (i / n) * Math.PI * 2;
            pts.push({
                x: clean(ax + Math.cos(a) * vertexRadius),
                y: clean(ay + Math.sin(a) * vertexRadius),
            });
        }
        pts.push({ ...pts[0] });
        return pts;
    }
    if (tool !== 'circle' && tool !== 'bezier') return null;
    if (tool === 'bezier') {
        // 4-click bezier: p0=ax,ay, c1=bx,by (temporary), finalized on 4th click
        // For now return null until full 4-click flow is implemented
        return null;
    }
    const pts: DraftPoint[] = [];
    for (let i = 0; i < 72; i += 1) {
        const a = (i / 72) * Math.PI * 2;
        // Snap the center and radius endpoints above, not every generated
        // perimeter sample. Snapping samples independently turns circles
        // into visibly faceted/grid-aligned shapes.
        pts.push({
            x: clean(ax + Math.cos(a) * r),
            y: clean(ay + Math.sin(a) * r),
        });
    }
    pts.push({ ...pts[0] });
    return pts;
}
/** Cubic bezier through 4 control clicks (camcanvas bezier tool). */
export function cubicBezierPoints(
    p0: DraftPoint,
    c1: DraftPoint,
    c2: DraftPoint,
    p3: DraftPoint,
    segments = 32,
): DraftPoint[] {
    const pts: DraftPoint[] = [];
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const mt = 1 - t;
        pts.push({
            x:
                mt * mt * mt * p0.x +
                3 * mt * mt * t * c1.x +
                3 * mt * t * t * c2.x +
                t * t * t * p3.x,
            y:
                mt * mt * mt * p0.y +
                3 * mt * mt * t * c1.y +
                3 * mt * t * t * c2.y +
                t * t * t * p3.y,
        });
    }
    return pts;
}

/** Magnetic endpoint snap for draw clicks (camcanvas snap-to-geometry). */
export function snapToEndpoints(
    loops: { points: DraftPoint[] }[],
    at: DraftPoint,
    tol: number,
): DraftPoint {
    let best: DraftPoint = at;
    let bestDist = tol;
    for (const loop of loops) {
        const pts = loop.points;
        if (!pts.length) continue;
        const ends = pts.length > 1 ? [pts[0], pts[pts.length - 1]] : [pts[0]];
        for (const p of ends) {
            const d = Math.hypot(p.x - at.x, p.y - at.y);
            if (d <= bestDist) {
                bestDist = d;
                best = p;
            }
        }
    }
    return best;
}
/** Arc through three points (start, bulge, end), sampled. Null if collinear. */
export function arcPoints3(
    p1: DraftPoint,
    p2: DraftPoint,
    p3: DraftPoint,
    segments = 48,
): DraftPoint[] | null {
    const d =
        2 *
        (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-9) return null;
    const sq = (p: DraftPoint) => p.x * p.x + p.y * p.y;
    const cx =
        (sq(p1) * (p2.y - p3.y) +
            sq(p2) * (p3.y - p1.y) +
            sq(p3) * (p1.y - p2.y)) /
        d;
    const cy =
        (sq(p1) * (p3.x - p2.x) +
            sq(p2) * (p1.x - p3.x) +
            sq(p3) * (p2.x - p1.x)) /
        d;
    const r = Math.hypot(p1.x - cx, p1.y - cy);
    const a0 = Math.atan2(p1.y - cy, p1.x - cx);
    const a2 = Math.atan2(p3.y - cy, p3.x - cx);
    const mid = Math.atan2(p2.y - cy, p2.x - cx);
    let sweep = a2 - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    // Pick the sweep direction that passes through the bulge point.
    let rel = mid - a0;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (sweep > 0 !== rel > 0)
        sweep = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2;
    const pts: DraftPoint[] = [];
    for (let i = 0; i <= segments; i += 1) {
        const a = a0 + (sweep * i) / segments;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
}
/** Screen-space ruler step: keeps ticks 48px apart or wider. */
export function rulerStep(scale: number): number {
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    for (const s of steps) {
        if (s * scale >= 48) return s;
    }
    return 1000;
}
