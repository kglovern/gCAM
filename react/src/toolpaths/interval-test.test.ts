import { buildIntervalTest, type IntervalTestSettings } from './interval-test';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_JOB_STOCK, jobStockBounds } from '../job/stock';
const settings: IntervalTestSettings = {
    min: 0.08,
    max: 0.16,
    steps: 5,
    size: 10,
    feed: 1200,
    power: 250,
    labelPower: 50,
    overscan: 2,
    pattern: 'solid',
};
test('interval calibration preserves the active power and air-assist policy', () => {
    const { path } = buildIntervalTest(settings, DEFAULT_JOB_STOCK, {
        powerMode: 'constant',
        airAssist: true,
    });
    const code = exportToolpaths([path], 'constant-interval', false, 'metric');
    expect(code).toContain('M3 S0');
    expect(code).toContain('M8');
    expect(code).toContain('M9');
    expect(code).not.toContain('M4');
});
test.each(['solid', 'dither'] as const)(
    '%s uses distinct pitches and engraved labels at fixed feed/power',
    (pattern) => {
        const result = buildIntervalTest(
            { ...settings, pattern },
            DEFAULT_JOB_STOCK,
        );
        expect(
            result.samples.map((s) => Number(s.interval.toFixed(2))),
        ).toEqual([0.08, 0.1, 0.12, 0.14, 0.16]);
        const counts = result.samples.map(
            (s) =>
                result.path.laserPaths.filter(
                    (p) =>
                        p.points[0].y > s.y + 4 &&
                        p.points[0].y < s.y + 14 &&
                        p.points[0].x >= s.x - 2.001 &&
                        p.points[0].x <= s.x + 12.001,
                ).length,
        );
        expect(counts[0]).toBeGreaterThan(counts[4]);
        const powers = new Set(
            result.path.laserPaths.flatMap((p) => p.points.map((v) => v.power)),
        );
        expect([...powers].sort((a, b) => a - b)).toEqual([0, 50, 250]);
        const code = exportToolpaths(
            [result.path],
            'interval-test',
            false,
            'metric',
        );
        expect(code).toContain('F1200');
        expect(code).toContain('S50');
        expect(code).toContain('S250');
        expect(code).not.toMatch(/M6|G[01] Z/);
    },
);
test.each(['front-left', 'center'] as const)(
    'wraps rows within stock at %s origin, including overscan',
    (origin) => {
        const stock = {
            ...DEFAULT_JOB_STOCK,
            widthMm: 50,
            heightMm: 100,
            origin,
        };
        const result = buildIntervalTest(settings, stock);
        const bounds = jobStockBounds(stock);
        for (const path of result.path.laserPaths)
            for (const p of path.points) {
                expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
                expect(p.x).toBeLessThanOrEqual(bounds.maxX);
                expect(p.y).toBeGreaterThanOrEqual(bounds.minY);
                expect(p.y).toBeLessThanOrEqual(bounds.maxY);
            }
    },
);
test.each([
    { min: 0 },
    { min: 0.08, max: 0.0801 },
    { max: 0.08 },
    { steps: 2.5 },
    { feed: 0 },
    { power: 1001 },
    { labelPower: NaN },
    { min: 0.02, steps: 12, size: 20 },
])('rejects invalid or excessive test settings %p', (change) => {
    expect(() =>
        buildIntervalTest({ ...settings, ...change }, DEFAULT_JOB_STOCK),
    ).toThrow();
});
test('rejects insufficient stock and machine feed ceiling', () => {
    expect(() =>
        buildIntervalTest(settings, { ...DEFAULT_JOB_STOCK, widthMm: 20 }),
    ).toThrow(/fit/);
    expect(() =>
        buildIntervalTest(settings, DEFAULT_JOB_STOCK, {}, 1000),
    ).toThrow(/feed/);
});
