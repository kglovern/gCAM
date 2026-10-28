/**
 * Purpose: Rotary profile model — Bezier radius-vs-X points with
 * corner/smooth/sym handle semantics, sampling, handle repair and
 * exact (de Casteljau) node insertion. Ported from VortexCAM.
 */
import type { ProfilePoint, ProfilePointType, ProfileSample } from './types';
import { PRACTICAL_TEMPLATES } from './practicalProfiles';

/** Work starts clear of the chuck (X=0 is the chuck face). */
export const CHUCK_CLEARANCE = 20;

export function makePoint(
    x: number,
    r: number,
    type: ProfilePointType = 'smooth',
    handle = 8,
): ProfilePoint {
    return {
        x,
        r,
        type,
        h1: { x: x - handle, r },
        h2: { x: x + handle, r },
    };
}

export function defaultProfile(): ProfilePoint[] {
    return templateHandles([
        {
            ...makePoint(CHUCK_CLEARANCE + 0, 11, 'corner'),
            h1: { x: CHUCK_CLEARANCE + 0, r: 11 },
        },
        makePoint(CHUCK_CLEARANCE + 6, 11, 'corner'),
        makePoint(CHUCK_CLEARANCE + 10, 7, 'smooth'),
        makePoint(CHUCK_CLEARANCE + 22, 6, 'smooth'),
        makePoint(CHUCK_CLEARANCE + 34, 9, 'smooth'),
        makePoint(CHUCK_CLEARANCE + 44, 5, 'smooth'),
        makePoint(CHUCK_CLEARANCE + 52, 7.5, 'smooth'),
        {
            ...makePoint(CHUCK_CLEARANCE + 58, 0.8, 'corner'),
            h2: { x: CHUCK_CLEARANCE + 58, r: 0.8 },
        },
    ]);
}

export const TEMPLATE_GROUPS = [
    'Furniture',
    'Kitchen',
    'Holidays',
    'Home decor',
    'Toys & games',
    'Workshop',
    'Basics',
    'Simplified chess set',
] as const;

export type TemplateDef = {
    label: string;
    group: (typeof TEMPLATE_GROUPS)[number];
    pts: Array<[number, number, ProfilePointType]>;
};

export const TEMPLATES: Record<string, TemplateDef> = {
    ...PRACTICAL_TEMPLATES,
    taperedChairLeg: {
        label: 'Chair leg — tapered · 450 mm',
        group: 'Furniture',
        pts: [
            [0, 20, 'corner'],
            [70, 20, 'corner'],
            [90, 18, 'smooth'],
            [420, 11, 'corner'],
            [440, 11, 'corner'],
            [450, 9, 'corner'],
        ],
    },
    turnedChairLeg: {
        label: 'Chair leg — turned · 450 mm',
        group: 'Furniture',
        pts: [
            [0, 22, 'corner'],
            [65, 22, 'corner'],
            [75, 18, 'corner'],
            [88, 23, 'smooth'],
            [102, 18, 'smooth'],
            [120, 15, 'smooth'],
            [160, 21, 'smooth'],
            [205, 16, 'smooth'],
            [255, 13, 'smooth'],
            [340, 11, 'smooth'],
            [400, 10, 'smooth'],
            [420, 14, 'smooth'],
            [440, 12, 'smooth'],
            [450, 10, 'corner'],
        ],
    },
    plainChairSpindle: {
        label: 'Chair-back spindle — tapered · 360 mm',
        group: 'Furniture',
        pts: [
            [0, 6, 'corner'],
            [20, 6, 'corner'],
            [28, 9, 'corner'],
            [65, 9, 'smooth'],
            [180, 7.5, 'smooth'],
            [320, 6.5, 'corner'],
            [332, 5, 'corner'],
            [360, 5, 'corner'],
        ],
    },
    turnedChairSpindle: {
        label: 'Chair-back spindle — turned · 360 mm',
        group: 'Furniture',
        pts: [
            [0, 6, 'corner'],
            [20, 6, 'corner'],
            [28, 9, 'corner'],
            [42, 10, 'smooth'],
            [58, 7, 'smooth'],
            [85, 6, 'smooth'],
            [135, 10, 'smooth'],
            [180, 11, 'smooth'],
            [225, 10, 'smooth'],
            [280, 6, 'smooth'],
            [300, 7, 'smooth'],
            [318, 9, 'smooth'],
            [330, 5, 'corner'],
            [360, 5, 'corner'],
        ],
    },
    ballFinial: {
        label: 'Curtain finial — ball · 85 mm',
        group: 'Furniture',
        pts: [
            [0, 14, 'corner'],
            [18, 14, 'corner'],
            [24, 18, 'smooth'],
            [32, 12, 'smooth'],
            [40, 19, 'smooth'],
            [55, 25, 'smooth'],
            [70, 21, 'smooth'],
            [80, 12, 'smooth'],
            [85, 3, 'corner'],
        ],
    },
    acornFinial: {
        label: 'Curtain finial — acorn · 100 mm',
        group: 'Furniture',
        pts: [
            [0, 14, 'corner'],
            [20, 14, 'corner'],
            [28, 18, 'smooth'],
            [36, 12, 'smooth'],
            [44, 22, 'corner'],
            [54, 22, 'corner'],
            [60, 19, 'smooth'],
            [72, 20, 'smooth'],
            [86, 15, 'smooth'],
            [96, 8, 'smooth'],
            [100, 3, 'corner'],
        ],
    },
    rollingPin: {
        label: 'Rolling pin — handled · 420 mm',
        group: 'Kitchen',
        pts: [
            [0, 10, 'corner'],
            [12, 13, 'smooth'],
            [45, 13, 'smooth'],
            [62, 9, 'smooth'],
            [72, 9, 'corner'],
            [82, 25, 'corner'],
            [338, 25, 'corner'],
            [348, 9, 'corner'],
            [358, 9, 'smooth'],
            [375, 13, 'smooth'],
            [408, 13, 'smooth'],
            [420, 10, 'corner'],
        ],
    },
    dowel: {
        label: 'Dowel Ø25',
        group: 'Basics',
        pts: [
            [0, 12.5, 'corner'],
            [60, 12.5, 'corner'],
        ],
    },
    pin: {
        label: 'Pin + collar',
        group: 'Basics',
        pts: [
            [0, 9, 'corner'],
            [8, 9, 'corner'],
            [10, 12, 'smooth'],
            [16, 12, 'corner'],
            [18, 6, 'smooth'],
            [50, 6, 'corner'],
            [52, 0.8, 'corner'],
        ],
    },
    bat: {
        label: 'Baseball bat · 450 mm',
        group: 'Toys & games',
        pts: [
            [0, 8, 'corner'],
            [18, 8, 'corner'],
            [20, 15, 'corner'],
            [26, 15, 'corner'],
            [34, 8, 'smooth'],
            [90, 8, 'smooth'],
            [140, 9, 'smooth'],
            [210, 13, 'smooth'],
            [290, 19, 'smooth'],
            [350, 23, 'smooth'],
            [400, 24, 'smooth'],
            [445, 24, 'corner'],
            [460, 23, 'smooth'],
            [470, 18, 'corner'],
            [472, 5, 'corner'],
            [490, 5, 'corner'],
        ],
    },
};

export function templateProfile(name: string): ProfilePoint[] {
    const t = TEMPLATES[name];
    const points = t.pts.map(([x, r, ty]) => {
        const p = makePoint(x + CHUCK_CLEARANCE, r, ty);
        p.h1 = { x: p.x, r };
        p.h2 = { x: p.x, r };
        return p;
    });
    return templateHandles(points);
}

function templateHandles(points: ProfilePoint[]): ProfilePoint[] {
    // Monotone harmonic tangents follow slopes, with flat tangents at extrema.
    for (let i = 1; i < points.length - 1; i++) {
        const p = points[i],
            left = points[i - 1],
            right = points[i + 1];
        if (p.type === 'corner') continue;
        const hl = p.x - left.x,
            hr = right.x - p.x;
        if (!(hl > 0 && hr > 0)) continue;
        const dl = (p.r - left.r) / hl,
            dr = (right.r - p.r) / hr;
        const w1 = 2 * hr + hl,
            w2 = hr + 2 * hl;
        const slope = dl * dr > 0 ? (w1 + w2) / (w1 / dl + w2 / dr) : 0;
        p.h1 = { x: p.x - hl / 3, r: p.r - (slope * hl) / 3 };
        p.h2 = { x: p.x + hr / 3, r: p.r + (slope * hr) / 3 };
    }
    return fitHandles(points);
}

function cubic(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    t: number,
): number {
    const u = 1 - t;
    return (
        u * u * u * p0 +
        3 * u * u * t * p1 +
        3 * u * t * t * p2 +
        t * t * t * p3
    );
}

function spanControls(
    a: ProfilePoint,
    b: ProfilePoint,
): {
    c1x: number;
    c1r: number;
    c2x: number;
    c2r: number;
} {
    return {
        c1x: a.type === 'corner' ? a.x : a.h2.x,
        c1r: a.type === 'corner' ? a.r : a.h2.r,
        c2x: b.type === 'corner' ? b.x : b.h1.x,
        c2r: b.type === 'corner' ? b.r : b.h1.r,
    };
}

export const PROFILE_SAMPLE_TOLERANCE = 0.005;

/** Sample the profile to a polyline, sorted by X. Optional adaptive sampling bounds curve error. */
export function sampleProfile(
    pts: ProfilePoint[],
    per = 12,
    tolerance?: number,
): ProfileSample[] {
    if (pts.length < 2) {
        return pts.map((p) => ({ x: p.x, r: Math.max(0, p.r) }));
    }
    const s = [...pts].sort((a, b) => a.x - b.x);
    const out: ProfileSample[] = [];
    for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        const { c1x, c1r, c2x, c2r } = spanControls(a, b);
        const d0 = c1x - a.x,
            d1 = c2x - c1x,
            d2 = b.x - c2x;
        const qa = d0 - 2 * d1 + d2,
            qb = 2 * (d1 - d0);
        const vertex = qa > 0 ? -qb / (2 * qa) : -1;
        const minimum = Math.min(
            d0,
            d2,
            vertex > 0 && vertex < 1
                ? (qa * vertex + qb) * vertex + d0
                : Infinity,
        );
        if (minimum < -1e-10 * Math.max(1, b.x - a.x)) {
            throw new Error(
                'Profile folds back along X. Shorten or reposition its handles.',
            );
        }

        if (tolerance !== undefined) {
            if (!(tolerance > 0) || !Number.isFinite(tolerance))
                throw new Error('Use a positive profile sampling tolerance.');
            const midpoint = (p: ProfileSample, q: ProfileSample) => ({
                x: (p.x + q.x) / 2,
                r: (p.r + q.r) / 2,
            });
            const flatten = (
                p: ProfileSample,
                q: ProfileSample,
                u: ProfileSample,
                v: ProfileSample,
                depth: number,
            ) => {
                const dx = v.x - p.x,
                    dr = v.r - p.r,
                    length2 = dx * dx + dr * dr;
                const distance = (n: ProfileSample) => {
                    const t = length2
                        ? Math.max(
                              0,
                              Math.min(
                                  1,
                                  ((n.x - p.x) * dx + (n.r - p.r) * dr) /
                                      length2,
                              ),
                          )
                        : 0;
                    return Math.hypot(n.x - p.x - t * dx, n.r - p.r - t * dr);
                };
                if (Math.max(distance(q), distance(u)) <= tolerance) {
                    out.push({ x: p.x, r: Math.max(0, p.r) });
                    return;
                }
                if (depth >= 20 || out.length > 50_000)
                    throw new Error(
                        'Profile curve is too complex. Simplify its handles.',
                    );
                const pq = midpoint(p, q),
                    qu = midpoint(q, u),
                    uv = midpoint(u, v),
                    left = midpoint(pq, qu),
                    right = midpoint(qu, uv),
                    centre = midpoint(left, right);
                flatten(p, pq, left, centre, depth + 1);
                flatten(centre, right, uv, v, depth + 1);
            };
            flatten(a, { x: c1x, r: c1r }, { x: c2x, r: c2r }, b, 0);
            continue;
        }
        for (let k = 0; k < per; k++) {
            const t = k / per;
            out.push({
                x: cubic(a.x, c1x, c2x, b.x, t),
                r: Math.max(0, cubic(a.r, c1r, c2r, b.r, t)),
            });
        }
    }
    const last = s[s.length - 1];
    out.push({ x: last.x, r: Math.max(0, last.r) });
    return out;
}

function scaleHandle(p: ProfilePoint, key: 'h1' | 'h2', factor: number): void {
    if (factor >= 1) return;
    p[key] = {
        x: p.x + (p[key].x - p.x) * factor,
        r: p.r + (p[key].r - p.r) * factor,
    };
}

/** Shorten only: ordered X controls guarantee dx/dt >= 0 over the entire cubic.
 * Radius is unrestricted above zero; no arbitrary Euclidean length limit.
 * Check neighbouring spans too, since a moved node or symmetric handle affects both. */
export function fitHandles(
    pts: ProfilePoint[],
    _only: number[] | null = null,
): ProfilePoint[] {
    const shrink = (p: ProfilePoint, key: 'h1' | 'h2', factor: number) => {
        scaleHandle(p, key, factor);
        if (p.type === 'sym')
            scaleHandle(p, key === 'h1' ? 'h2' : 'h1', factor);
    };
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.type === 'corner') continue;
        for (const key of ['h1', 'h2'] as const) {
            const h = p[key],
                dx = h.x - p.x;
            if (!Number.isFinite(h.x) || !Number.isFinite(h.r)) {
                p[key] = { x: p.x, r: p.r };
                if (p.type === 'sym')
                    p[key === 'h1' ? 'h2' : 'h1'] = { x: p.x, r: p.r };
                continue;
            }
            let factor = key === 'h1' ? (dx > 0 ? 0 : 1) : dx < 0 ? 0 : 1;
            const neighbour = key === 'h1' ? pts[i - 1] : pts[i + 1];
            if (neighbour && dx !== 0)
                factor = Math.min(
                    factor,
                    Math.max(0, Math.abs(neighbour.x - p.x) / Math.abs(dx)),
                );
            if (h.r < 0) factor = Math.min(factor, p.r / (p.r - h.r));
            shrink(p, key, Math.max(0, factor));
        }
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i],
            b = pts[i + 1];
        const left = a.type === 'corner' ? 0 : a.h2.x - a.x;
        const right = b.type === 'corner' ? 0 : b.x - b.h1.x;
        const gap = Math.max(0, b.x - a.x);
        if (left + right > gap) {
            const factor = gap / (left + right);
            if (a.type !== 'corner') shrink(a, 'h2', factor);
            if (b.type !== 'corner') shrink(b, 'h1', factor);
        }
    }
    return pts;
}

/**
 * Split the span nearest (x, r) and insert a smooth node via exact de
 * Casteljau subdivision (bit-identical curve), except adjacent to corner
 * points, where it falls back to tangent handles. Mutates pts.
 */
export function insertNode(
    pts: ProfilePoint[],
    x: number,
    r: number,
    per = 16,
): { index: number; point: ProfilePoint } {
    const s = [...pts].sort((a, b) => a.x - b.x);
    let best: { d: number; i: number; t: number } | null = null;
    for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        const { c1x, c1r, c2x, c2r } = spanControls(a, b);
        for (let k = 0; k <= per; k++) {
            const t = k / per;
            const d = Math.hypot(
                cubic(a.x, c1x, c2x, b.x, t) - x,
                cubic(a.r, c1r, c2r, b.r, t) - r,
            );
            if (!best || d < best.d) {
                best = { d, i, t };
            }
        }
    }
    const found = best ?? { i: 0, t: 0.5 };
    const a = s[found.i];
    const b = s[found.i + 1];
    const t = Math.min(0.999, Math.max(0.001, found.t));
    const { c1x, c1r, c2x, c2r } = spanControls(a, b);
    const lp = (p0: number, p1: number): number => p0 + (p1 - p0) * t;
    const A = { x: a.x, r: a.r };
    const B = { x: c1x, r: c1r };
    const C = { x: c2x, r: c2r };
    const D = { x: b.x, r: b.r };
    const E = { x: lp(A.x, B.x), r: lp(A.r, B.r) };
    const F = { x: lp(B.x, C.x), r: lp(B.r, C.r) };
    const G = { x: lp(C.x, D.x), r: lp(C.r, D.r) };
    const H = { x: lp(E.x, F.x), r: lp(E.r, F.r) };
    const I = { x: lp(F.x, G.x), r: lp(F.r, G.r) };
    const Sv = { x: lp(H.x, I.x), r: lp(H.r, I.r) };
    const p: ProfilePoint = {
        x: Sv.x,
        r: Math.max(0, Sv.r),
        type: 'smooth',
        h1: { x: H.x, r: H.r },
        h2: { x: I.x, r: I.r },
    };
    if (a.type !== 'corner') {
        a.h2 = { x: E.x, r: E.r };
    }
    if (b.type !== 'corner') {
        b.h1 = { x: G.x, r: G.r };
    }
    pts.push(p);
    pts.sort((m, n) => m.x - n.x);
    return { index: pts.indexOf(p), point: p };
}

/** Deep copy helper for immutable React state updates. */
export function clonePoints(pts: ProfilePoint[]): ProfilePoint[] {
    return pts.map((p) => ({
        ...p,
        h1: { ...p.h1 },
        h2: { ...p.h2 },
    }));
}
