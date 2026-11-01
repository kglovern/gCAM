import {
    buildScanAlignmentTest,
    loadScanAlignment,
    saveScanAlignment,
} from './scan-alignment';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { controllerPreset } from '../gcode/profiles';
import { DEFAULT_JOB_STOCK } from '../job/stock';
import { DEFAULT_LASER_ROTARY } from '../cam/laser-rotary.js';

test('alignment profiles stay separate for each machine and laser identity', () => {
    localStorage.clear();
    const profile = {
        enabled: true,
        measurements: [
            { feed: 1000, gap: 0.2 },
            { feed: 2000, gap: 0.4 },
        ],
    };
    saveScanAlignment('machine-a|diode:10:G2', profile);
    expect(loadScanAlignment('machine-a|diode:10:G2')).toEqual(profile);
    expect(loadScanAlignment('machine-b|diode:10:G2')).toBeUndefined();
    expect(loadScanAlignment('machine-a|co2:100:G2')).toBeUndefined();
    expect(() =>
        saveScanAlignment('bad', { enabled: true, measurements: [] }),
    ).toThrow('two');
});

test('the physical test emits uncorrected paired rows at each requested speed, within centered stock', () => {
    const stock = {
        ...DEFAULT_JOB_STOCK,
        widthMm: 100,
        heightMm: 100,
        origin: 'center' as const,
    };
    const job = buildScanAlignmentTest({
        feeds: [2000, 1000],
        power: 150,
        overscan: 2.5,
        stock,
        maxFeed: 3000,
    });
    expect(job.laserPaths).toHaveLength(40);
    expect(job.laserPaths.slice(0, 20).every((p) => p.feed === 1000)).toBe(
        true,
    );
    expect(job.laserPaths.slice(20).every((p) => p.feed === 2000)).toBe(true);
    for (const row of job.laserPaths) {
        expect(row.points.map((p) => p.power)).toEqual([0, 0, 150, 0]);
        expect(Math.abs(row.points[2].x - row.points[1].x)).toBe(50);
        for (const p of row.points) {
            expect(p.x).toBeGreaterThanOrEqual(-50);
            expect(p.x).toBeLessThanOrEqual(50);
            expect(p.y).toBeGreaterThanOrEqual(-50);
            expect(p.y).toBeLessThanOrEqual(50);
        }
    }
    const code = exportToolpaths(
        [job],
        'alignment',
        false,
        'metric',
        controllerPreset('grblhal'),
    );
    expect(code).toContain('F1000');
    expect(code).toContain('F2000');
    expect(code).toContain('M4 S0');
    expect(code).toContain('S150');
    expect(code).not.toMatch(/G[01] .*Z/);
    const aligned = {
        ...job,
        laserOptions: {
            passes: 1,
            scanAlignment: {
                enabled: true,
                measurements: [
                    { feed: 1000, gap: 0.2 },
                    { feed: 3000, gap: 0.6 },
                ],
            },
        },
    };
    const settings = controllerPreset('grblhal');
    expect(() =>
        exportToolpaths([aligned], 'aligned', false, 'metric', {
            ...settings,
            decimals: 1,
        }),
    ).toThrow('precision');
    expect(() =>
        exportToolpaths([aligned], 'aligned', false, 'imperial', {
            ...settings,
            decimals: 3,
        }),
    ).toThrow('precision');
    expect(() =>
        exportToolpaths([aligned], 'aligned', false, 'imperial', {
            ...settings,
            decimals: 4,
        }),
    ).not.toThrow();
    expect(() =>
        exportToolpaths(
            [
                {
                    ...aligned,
                    laserRotary: { ...DEFAULT_LASER_ROTARY, confirmed: true },
                },
            ],
            'rotary',
            false,
            'metric',
            settings,
        ),
    ).toThrow('flat laser');
    expect(() =>
        buildScanAlignmentTest({
            feeds: [1000, 2000],
            power: 150,
            overscan: 2.5,
            stock: {
                ...stock,
                laserRotary: {
                    ...DEFAULT_LASER_ROTARY,
                    type: 'chuck',
                    axis: 'Y',
                },
            },
        }),
    ).toThrow('flat laser');
    expect(() =>
        buildScanAlignmentTest({
            feeds: [1000, 2000],
            power: 150,
            overscan: 2.5,
            stock: { ...stock, widthMm: 50 },
        }),
    ).toThrow('fit');
});
