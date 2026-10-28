import { mandalaLoops } from './mandala';
test('closed finite loops fit the diameter and repeat symmetrically', () => {
    const loops = mandalaLoops({ diameter: 150, petals: 12, rings: 3 });
    expect(loops).toHaveLength(38);
    for (const loop of loops) {
        expect(loop.points[0]).toEqual(loop.points[loop.points.length - 1]);
        for (const p of loop.points) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(75.000001);
        }
    }
    const a = loops[2].points[20],
        b = loops[3].points[20],
        t = Math.PI / 6;
    expect(b.x).toBeCloseTo(a.x * Math.cos(t) - a.y * Math.sin(t));
    expect(b.y).toBeCloseTo(a.x * Math.sin(t) + a.y * Math.cos(t));
});
test('rejects invalid geometry requests', () => {
    for (const patch of [
        { diameter: NaN },
        { diameter: 0 },
        { petals: 1000 },
        { petals: 4.5 },
        { rings: 0 },
    ])
        expect(() =>
            mandalaLoops({ diameter: 150, petals: 12, rings: 3, ...patch }),
        ).toThrow();
});
