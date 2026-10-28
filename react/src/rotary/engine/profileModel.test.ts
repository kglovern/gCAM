/** Tests: rotary profile model — templates, handle repair, node insertion. */
import {
    fitHandles,
    insertNode,
    makePoint,
    sampleProfile,
    templateProfile,
    TEMPLATES,
} from './profileModel';
import type { ProfilePoint } from './types';

function maxDeviation(
    a: Array<{ x: number; r: number }>,
    b: Array<{ x: number; r: number }>,
): number {
    let mx = 0;
    for (const p of a) {
        let m = Infinity;
        for (const q of b) {
            m = Math.min(m, Math.hypot(p.x - q.x, p.r - q.r));
        }
        mx = Math.max(mx, m);
    }
    return mx;
}

test('all templates have bounded handles and fold-free sampling', () => {
    for (const name of Object.keys(TEMPLATES)) {
        const q = templateProfile(name);
        q.forEach((p, i) => {
            if (p.type === 'corner') {
                return;
            }
            const gl = i > 0 ? Math.abs(p.x - q[i - 1].x) : 99;
            const gr = i < q.length - 1 ? Math.abs(q[i + 1].x - p.x) : 99;
            for (const [h, g] of [
                [p.h1, gl],
                [p.h2, gr],
            ] as const) {
                const L = Math.hypot(h.x - p.x, h.r - p.r);
                expect(L).toBeLessThanOrEqual(0.35 * g + 0.16);
            }
        });
        const s = sampleProfile(q, 32);
        s.forEach((p, i) => {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.r)).toBe(true);
            expect(p.r).toBeGreaterThan(0);
            if (i > 0) {
                expect(p.x).toBeGreaterThanOrEqual(s[i - 1].x - 1e-9);
            }
        });
    }
});

test('insertNode on a smooth span is bit-exact', () => {
    const q = templateProfile('queen');
    const before = sampleProfile(q, 64);
    insertNode(q, 48, 7.5);
    expect(maxDeviation(before, sampleProfile(q, 64))).toBeLessThan(1e-6);
});

test('insertNode next to a corner stays local', () => {
    const q = templateProfile('queen');
    const before = sampleProfile(q, 64);
    insertNode(q, 27, 10);
    expect(maxDeviation(before, sampleProfile(q, 64))).toBeLessThan(0.5);
});

test('fitHandles never lengthens and keeps sides', () => {
    const pts: ProfilePoint[] = [
        makePoint(0, 10, 'corner'),
        makePoint(10, 10, 'smooth'),
        makePoint(12, 6, 'smooth'),
        makePoint(30, 6, 'corner'),
    ];
    // Grossly overreaching handles.
    pts[1].h2 = { x: 40, r: 10 };
    pts[2].h1 = { x: -20, r: 6 };
    fitHandles(pts);
    expect(pts[1].h2.x).toBeLessThanOrEqual(10 + 0.35 * 2 + 1e-9);
    expect(pts[2].h1.x).toBeGreaterThanOrEqual(12 - 0.35 * 2 - 1e-9);
    // Corners untouched.
    expect(pts[0].h1).toEqual({ x: -8, r: 10 });
});

test('adaptive sampling bounds the distance to a strongly curved Bezier span', () => {
    const points: ProfilePoint[] = [
        {
            x: 30,
            r: 8,
            type: 'smooth',
            h1: { x: 30, r: 8 },
            h2: { x: 31, r: 30 },
        },
        {
            x: 70,
            r: 8,
            type: 'smooth',
            h1: { x: 69, r: 0 },
            h2: { x: 70, r: 8 },
        },
    ];
    const poly = sampleProfile(points, 16, 0.005);
    expect(poly.length).toBeGreaterThan(16);
    let error = 0;
    for (let i = 0; i <= 1000; i++) {
        const t = i / 1000,
            u = 1 - t,
            x =
                u * u * u * 30 +
                3 * u * u * t * 31 +
                3 * u * t * t * 69 +
                t * t * t * 70,
            r = u * u * u * 8 + 3 * u * u * t * 30 + t * t * t * 8;
        let nearest = Infinity;
        for (let j = 1; j < poly.length; j++) {
            const p = poly[j - 1],
                q = poly[j],
                dx = q.x - p.x,
                dr = q.r - p.r;
            const v = Math.max(
                0,
                Math.min(
                    1,
                    ((x - p.x) * dx + (r - p.r) * dr) / (dx * dx + dr * dr),
                ),
            );
            nearest = Math.min(
                nearest,
                Math.hypot(x - p.x - v * dx, r - p.r - v * dr),
            );
        }
        error = Math.max(error, nearest);
    }
    expect(error).toBeLessThanOrEqual(0.005);
});
