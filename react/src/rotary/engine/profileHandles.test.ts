import {
    fitHandles,
    makePoint,
    sampleProfile,
    templateProfile,
    TEMPLATES,
} from './profileModel';

function assertForward(points: ReturnType<typeof makePoint>[]) {
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
            b = points[i];
        const c1 = a.type === 'corner' ? a.x : a.h2.x;
        const c2 = b.type === 'corner' ? b.x : b.h1.x;
        // Independent check of the exact quadratic derivative, including its interior minimum.
        const d0 = c1 - a.x,
            d1 = c2 - c1,
            d2 = b.x - c2;
        const aa = d0 - 2 * d1 + d2,
            bb = 2 * (d1 - d0);
        const t = aa > 0 ? -bb / (2 * aa) : -1;
        const minimum = Math.min(
            d0,
            d2,
            t > 0 && t < 1 ? aa * t * t + bb * t + d0 : Infinity,
        );
        expect(minimum).toBeGreaterThanOrEqual(-1e-8);
    }
    const sampled = sampleProfile(points, 128);
    expect(
        sampled.every((p) => Number.isFinite(p.x) && Number.isFinite(p.r)),
    ).toBe(true);
    expect(sampled.every((p, i) => !i || p.x >= sampled[i - 1].x - 1e-9)).toBe(
        true,
    );
}

test('long steep handles survive without an arbitrary length limit', () => {
    const pts = [makePoint(0, 100), makePoint(10, 100)];
    pts[0].h2 = { x: 2, r: 190 };
    pts[1].h1 = { x: 8, r: 10 };
    fitHandles(pts);
    expect(pts[0].h2).toEqual({ x: 2, r: 190 });
    expect(pts[1].h1).toEqual({ x: 8, r: 10 });
    assertForward(pts);
});

test('crossed, reversed, coincident and tiny-gap handles remain forward', () => {
    for (const gap of [0, 1e-9, 0.01, 1, 100]) {
        const pts = [makePoint(10, 20, 'sym'), makePoint(10 + gap, 20, 'sym')];
        pts[0].h2 = { x: 1000, r: 2000 };
        pts[0].h1 = { x: -980, r: -1960 };
        pts[1].h1 = { x: -500, r: -100 };
        pts[1].h2 = { x: 520 + 2 * gap, r: 140 };
        fitHandles(pts, [0]);
        assertForward(pts);
        for (const p of pts) {
            expect(p.h1.x + p.h2.x).toBeCloseTo(2 * p.x);
            expect(p.h1.r + p.h2.r).toBeCloseTo(2 * p.r);
        }
    }
    const reversed = [makePoint(0, 10), makePoint(1, 10)];
    reversed[0].h2.x = -100;
    reversed[1].h1.x = 100;
    fitHandles(reversed);
    assertForward(reversed);
});

test('deterministic extreme handle edits never fold the actual cubic', () => {
    let seed = 7823;
    const random = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let n = 0; n < 400; n++) {
        const pts = Array.from({ length: 5 }, (_, i) =>
            makePoint(
                i * 0.01 + i * i,
                1 + random() * 40,
                n % 2 ? 'smooth' : 'sym',
            ),
        );
        for (const p of pts) {
            p.h1 = {
                x: p.x - (random() - 0.2) * 1000,
                r: (random() - 0.5) * 10000,
            };
            p.h2 = {
                x: p.x + (random() - 0.2) * 1000,
                r: (random() - 0.5) * 10000,
            };
        }
        fitHandles(pts);
        assertForward(pts);
    }
});

test('sampling rejects an unrepaired fold rather than hiding it by sorting', () => {
    const pts = [makePoint(0, 5), makePoint(10, 5)];
    pts[0].h2.x = 100;
    pts[1].h1.x = -100;
    expect(() => sampleProfile(pts)).toThrow(/folds back/);
    fitHandles(pts);
    assertForward(pts);
});

test('template tangents follow slopes, stay flat at extrema and do not overshoot radii', () => {
    let sloped = 0;
    for (const name of Object.keys(TEMPLATES)) {
        const pts = templateProfile(name);
        assertForward(pts);
        for (let i = 1; i < pts.length - 1; i++) {
            const p = pts[i],
                l = pts[i - 1],
                r = pts[i + 1];
            if (p.type === 'corner') continue;
            if ((p.r - l.r) * (r.r - p.r) <= 0) expect(p.h1.r).toBe(p.r);
            else if (p.h2.r !== p.r) sloped++;
        }
        for (let i = 1; i < pts.length; i++) {
            const low = Math.min(pts[i - 1].r, pts[i].r),
                high = Math.max(pts[i - 1].r, pts[i].r);
            for (const p of sampleProfile([pts[i - 1], pts[i]], 64)) {
                expect(p.r).toBeGreaterThanOrEqual(low - 1e-8);
                expect(p.r).toBeLessThanOrEqual(high + 1e-8);
            }
        }
    }
    expect(sloped).toBeGreaterThan(30);
});
