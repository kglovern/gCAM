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
