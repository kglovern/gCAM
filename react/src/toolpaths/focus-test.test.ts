import {
    buildFocusTest,
    focusTestDefaults,
    type FocusTestSettings,
} from './focus-test';
import { DEFAULT_JOB_STOCK, jobStockBounds } from '../job/stock';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { controllerPreset } from '../gcode/profiles';
import { laserExportPayload } from '../gcode/laserExportPayload';
import { validateFocusProgram } from '../gcode/focusProgram';

const ramp: FocusTestSettings = {
    ...focusTestDefaults(1200, 100),
    leftGapMm: 10,
    rightGapMm: 18,
};
const sweep: FocusTestSettings = {
    ...ramp,
    mode: 'sweep',
    controlledZ: true,
    minZMm: -10,
    maxZMm: 10,
    startZMm: -2,
    endZMm: 2,
    travelZMm: 5,
    zFeedMmMin: 300,
};
test.each(['ramp', 'sweep'] as const)(
    'perforated %s labels reduce marked length without changing calibration strokes or Z',
    (mode) => {
        const settings = mode === 'ramp' ? ramp : sweep;
        const plain = buildFocusTest(settings, DEFAULT_JOB_STOCK).path;
        const perforated = buildFocusTest(
            {
                ...settings,
                labelPerforation: true,
                labelCutMm: 0.1,
                labelSkipMm: 0.3,
            },
            DEFAULT_JOB_STOCK,
        ).path;
        const poweredLength = (path: typeof plain) =>
            path.laserPaths.reduce(
                (total, line) =>
                    total +
                    line.points
                        .slice(1)
                        .reduce(
                            (n, p, i) =>
                                n +
                                (p.power > 0
                                    ? Math.hypot(
                                          p.x - line.points[i].x,
                                          p.y - line.points[i].y,
                                      )
                                    : 0),
                            0,
                        ),
                0,
            );
        expect(perforated.laserPaths[0]).toEqual(plain.laserPaths[0]);
        expect(perforated.laserPaths.map((p) => p.focusZMm)).toEqual(
            plain.laserPaths.map((p) => p.focusZMm),
        );
        expect(poweredLength(perforated)).toBeLessThan(poweredLength(plain));
        expect(
            perforated.previewContours.some((p) => p._laserVariablePower),
        ).toBe(true);
        expect(() =>
            exportToolpaths([perforated], 'perforated-focus', false, 'metric'),
        ).not.toThrow();
    },
);
test.each([0, -1, Infinity, NaN])(
    'invalid focus label perforation length %s fails',
    (length) => {
        expect(() =>
            buildFocusTest(
                { ...ramp, labelPerforation: true, labelCutMm: length },
                DEFAULT_JOB_STOCK,
            ),
        ).toThrow('cut/skip');
    },
);
test.each([
    'G1 A10 S0',
    'G1 X20 S0 S100',
    'G1 X20 F0 S10',
    'G0 X20 S10',
    'G1 X20 S10\nG4 P1',
    'G1 Z1 X20 F300 S0',
])(
    'rendered focus export rejects ambiguous or unsupported motion: %s',
    (command) => {
        const path = buildFocusTest(sweep, DEFAULT_JOB_STOCK).path;
        expect(() =>
            validateFocusProgram(
                'G21 G90\nG1 Z5 F300 S0\nG1 X10 Y10 F1200 S0\n' +
                    command +
                    '\nG1 Z5 F300 S0\nM5',
                [path],
                controllerPreset(),
            ),
        ).toThrow();
    },
);
test('ramp marks span measured gaps and emit no Z or milling tool changes', () => {
    const result = buildFocusTest(ramp, DEFAULT_JOB_STOCK);
    expect(result.samples.map((s) => s.valueMm)).toEqual([
        10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    const code = exportToolpaths([result.path], 'focus-ramp', false, 'metric');
    expect(code).not.toMatch(/\bZ[+-]?[0-9]|M6/);
    expect(code).toContain('S50');
    expect(code).toContain('S25');
});
test.each(['front-left', 'center'] as const)(
    'sweep at %s origin stays within stock and explicitly turns power off for every height move',
    (origin) => {
        const stock = { ...DEFAULT_JOB_STOCK, origin };
        const result = buildFocusTest(sweep, stock);
        const bounds = jobStockBounds(stock);
        for (const path of result.path.laserPaths)
            for (const p of path.points) {
                expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
                expect(p.x).toBeLessThanOrEqual(bounds.maxX);
                expect(p.y).toBeGreaterThanOrEqual(bounds.minY);
                expect(p.y).toBeLessThanOrEqual(bounds.maxY);
            }
        const code = exportToolpaths(
            [result.path],
            'focus-sweep',
            false,
            'metric',
        );
        const moves = code
            .split('\n')
            .filter((line) => /\bZ[+-]?[0-9]/.test(line));
        expect(moves.length).toBeGreaterThan(9);
        for (const line of moves) {
            expect(line).toMatch(/^G1 /);
            expect(line).toContain('S0');
            expect(line).toContain('F300');
        }
        expect(moves[moves.length - 1]).toContain('Z5');
        for (const sample of result.samples)
            expect(
                moves.some((line) => line.includes('Z' + sample.valueMm + ' ')),
            ).toBe(true);
        expect(
            exportToolpaths(
                laserExportPayload([result.path]),
                'focus-sweep',
                false,
                'metric',
            ),
        ).toBe(code);
    },
);
test.each(['grblhal', 'grbl', 'duet', 'marlin'] as const)(
    'controller-aware %s sweep uses its own S range and supported syntax',
    (controller) => {
        const profile = {
            ...controllerPreset(controller),
            laserConfirmed: true,
        };
        const { path } = buildFocusTest(sweep, DEFAULT_JOB_STOCK);
        const code = exportToolpaths(
            [path],
            'focus-sweep',
            false,
            'metric',
            profile,
        );
        expect(code).toContain('Z-2');
        expect(code).toContain('S' + profile.laserMax * 0.05);
        if (controller === 'marlin') expect(code).toContain('M3 I S0');
    },
);
test('imperial sweep preserves physical Z and fine steps require enough output precision', () => {
    const { path } = buildFocusTest(sweep, DEFAULT_JOB_STOCK, 'imperial');
    const code = exportToolpaths([path], 'focus-sweep', false, 'imperial');
    expect(code).toContain('G20');
    const z = code
        .split('\n')
        .filter((line) => /\bZ/.test(line))
        .map((line) => Number(line.match(/Z([+-]?[0-9.]+)/)![1]) * 25.4);
    expect(Math.min(...z)).toBeCloseTo(-2, 3);
    expect(z[z.length - 1]).toBeCloseTo(5, 3);
    const fine = buildFocusTest({ ...sweep, endZMm: -1.92 }, DEFAULT_JOB_STOCK);
    expect(() =>
        exportToolpaths([fine.path], 'fine', false, 'imperial', {
            ...controllerPreset(),
            decimals: 3,
        }),
    ).toThrow('precision');
});
test.each([
    { controlledZ: false },
    { minZMm: 0, maxZMm: 0 },
    { startZMm: -11 },
    { travelZMm: 1 },
    { zFeedMmMin: 0 },
    { endZMm: -2 },
    { samples: 100 },
    { power: 0 },
] as Partial<FocusTestSettings>[])(
    'rejects invalid or unconfigured sweep: %j',
    (patch) => {
        expect(() =>
            buildFocusTest({ ...sweep, ...patch }, DEFAULT_JOB_STOCK),
        ).toThrow();
    },
);
test('negative-clearance machines and descending sweeps are explicit', () => {
    const { path } = buildFocusTest(
        {
            ...sweep,
            startZMm: 2,
            endZMm: -2,
            travelZMm: -5,
            clearanceDirection: -1,
        },
        DEFAULT_JOB_STOCK,
    );
    expect(exportToolpaths([path], 'descending', false, 'metric')).toContain(
        'G1 Z-5 F300 S0',
    );
});
test('rendered custom blocks cannot introduce unchecked focus motion, positive-power Z or static laser power', () => {
    for (const [block, text] of [
        ['start', 'G0 Z1'],
        ['start', 'G53 G0 Z0'],
        ['start', '$H'],
        ['end', 'M3 S1000'],
    ] as const) {
        const profile = controllerPreset();
        profile.blocks = { ...profile.blocks, [block]: text };
        expect(() =>
            exportToolpaths(
                [buildFocusTest(ramp, DEFAULT_JOB_STOCK).path],
                'focus',
                false,
                'metric',
                profile,
            ),
        ).toThrow();
    }
    const profile = controllerPreset();
    profile.blocks = { ...profile.blocks, start: 'G1 Z0 F300 S100' };
    expect(() =>
        exportToolpaths(
            [buildFocusTest(sweep, DEFAULT_JOB_STOCK).path],
            'focus',
            false,
            'metric',
            profile,
        ),
    ).toThrow();
});
test('missing focus metadata or path heights are rejected and ordinary jobs are not mutated', () => {
    const focus = buildFocusTest(sweep, DEFAULT_JOB_STOCK).path;
    expect(() =>
        exportToolpaths(
            [{ ...focus, laserFocusTest: undefined }],
            'invalid',
            false,
            'metric',
        ),
    ).toThrow('explicit');
    expect(() =>
        exportToolpaths(
            [
                {
                    ...focus,
                    laserPaths: focus.laserPaths.map((p) => ({
                        ...p,
                        focusZMm: undefined,
                    })),
                },
            ],
            'invalid',
            false,
            'metric',
        ),
    ).toThrow('heights');
    const manual = buildFocusTest(ramp, DEFAULT_JOB_STOCK).path;
    const ordinary = { ...manual, laserFocusTest: undefined };
    const before = exportToolpaths([ordinary], 'ordinary', false, 'metric');
    exportToolpaths([focus], 'focus', false, 'metric');
    expect(exportToolpaths([ordinary], 'ordinary', false, 'metric')).toBe(
        before,
    );
    expect(before).not.toMatch(/\bZ[+-]?[0-9]/);
});
