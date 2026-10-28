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
import { runChecks } from './checks';
import { defaultSupports } from './supports';

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

test('all templates have finite fold-free sampling', () => {
    for (const name of Object.keys(TEMPLATES)) {
        const q = templateProfile(name);
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

test('baseball bat and mounting stubs fit standard stock with a quarter-inch cutter', () => {
    const samples = sampleProfile(templateProfile('bat'), 32);
    expect(
        Math.max(...samples.map((point) => point.r)) * 2,
    ).toBeLessThanOrEqual(50);
    const flags = runChecks(
        samples,
        {
            length: 546,
            diameter: 50,
            grip: 19,
            ext: false,
            supports: { ...defaultSupports },
        },
        {
            type: 'ball',
            dia: 6.35,
            feed: 1000,
            plunge: 200,
            spindle: 16000,
            slotNum: 1,
        },
        {
            face: false,
            rough: true,
            finish: false,
            allow: 0.5,
            roughStep: 2,
            raster: 0,
            groove: { on: false, x: 100, w: 5 },
            part: { on: false, x: 500 },
            pommels: [],
            compR: 0,
        },
    );
    expect(flags.filter((flag) => flag.level === 'e')).toEqual([]);
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
    expect(pts[1].h2.x).toBeLessThanOrEqual(pts[2].h1.x);
    expect(pts[2].h1.x).toBeGreaterThanOrEqual(pts[1].h2.x);
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
