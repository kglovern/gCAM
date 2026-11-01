import {
    validateLaserRotary,
    laserRotaryScale,
    laserRotaryMove,
    laserRotarySurfacePoint,
    laserInverseFeed,
} from './laser-rotary.js';
import { createLaserToolpath } from './laser.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { laserExportPayload } from '../gcode/laserExportPayload';
import { controllerPreset } from '../gcode/profiles';
const setup = (extra = {}) =>
    validateLaserRotary({
        type: 'chuck',
        axis: 'Y',
        objectDiameter: 40,
        rollerDiameter: 10,
        unitsPerTurn: 100,
        reverse: false,
        confirmed: true,
        ...extra,
    })!;
const path = (rotary = setup()) => ({
    ...createLaserToolpath(
        [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 30, y: 40 },
                ],
            },
        ],
        {
            operation: 'laser-cut',
            laserFeed: 1000,
            laserPower: 250,
            laserSMin: 0,
            laserSMax: 1000,
            laserGamma: 1,
            laserSpot: 0.2,
            laserOverscan: 0,
            spindle: 12000,
            feedRate: 1000,
            plungeRate: 300,
            safeZ: 5,
            toolDiameter: 1,
            laserOptions: { passes: 2 },
        },
    ),
    laserRotary: rotary,
});
test('chuck uses object circumference; rollers use driven roller circumference', () => {
    expect(laserRotaryScale(setup()) * Math.PI * 40).toBeCloseTo(100, 10);
    const roller = setup({ type: 'roller' });
    expect(laserRotaryScale(roller) * Math.PI * 40).toBeCloseTo(400, 10);
    expect(
        laserRotaryScale(setup({ type: 'roller', objectDiameter: 100 })),
    ).toBe(laserRotaryScale(roller));
    expect(laserRotaryScale(setup({ reverse: true }))).toBe(
        -laserRotaryScale(setup()),
    );
});
test('linear remapping preserves surface time for diagonal, axial and pure rotary moves', () => {
    for (const [x, y] of [
        [30, 40],
        [30, 0],
        [0, 40],
    ]) {
        const s = setup({ axis: 'Z' }),
            move = laserRotaryMove({ x: 0, y: 0 }, { x, y }, 1000, s)!;
        expect(Math.hypot(move.x, move.rotation) / move.feed).toBeCloseTo(
            Math.hypot(x, y) / 1000,
            12,
        );
        expect(move.minutes).toBeCloseTo(Math.hypot(x, y) / 1000, 12);
    }
});
test('dedicated A uses inverse time and does not wrap away complete revolutions', () => {
    const s = setup({ axis: 'A', unitsPerTurn: 360 }),
        move = laserRotaryMove(
            { x: 0, y: 0 },
            { x: 0, y: Math.PI * 40 * 2 },
            1000,
            s,
        )!;
    expect(move.rotation).toBeCloseTo(720, 10);
    expect(1 / move.feed).toBeCloseTo(move.minutes, 12);
    expect(laserRotaryMove({ x: 0, y: 0 }, { x: 0, y: 0 }, 1000, s)).toBeNull();
    for (const f of [1e-9, 1e-6, 1234.56789, 1e12])
        expect(laserInverseFeed(f)).not.toMatch(/[eE]/);
    expect(() => laserInverseFeed(Infinity)).toThrow('timing');
});
test('surface preview places a full circumference on the original cylinder seam', () => {
    const s = setup();
    const a = laserRotarySurfacePoint({ x: 20, y: 0 }, s),
        b = laserRotarySurfacePoint({ x: 20, y: Math.PI * 40 }, s);
    expect(b.x).toBe(a.x);
    expect(b.y).toBeCloseTo(a.y, 10);
    expect(b.z).toBeCloseTo(a.z, 10);
    const quarter = laserRotarySurfacePoint(
        { x: 20, y: (Math.PI * 40) / 4 },
        s,
    );
    expect(quarter.y).toBeCloseTo(20, 10);
    expect(quarter.z).toBeCloseTo(0, 10);
});
test('real output restores G94, preserves power, uses configured axes and keeps worker payload identical', () => {
    const p = path(setup({ axis: 'A', unitsPerTurn: 360 })),
        code = exportToolpaths([p], 'rotary', false, 'metric');
    expect(code.match(/^G93$/gm)).toHaveLength(2);
    expect(code).toMatch(/G1 X30 A114\.5916 S250 F20\b/);
    expect(code.lastIndexOf('G94')).toBeGreaterThan(code.lastIndexOf('G93'));
    expect(code).not.toMatch(/G91|G92|M6|G[01] [^\n]*[YZ]/);
    expect(
        exportToolpaths(laserExportPayload([p]), 'rotary', false, 'metric'),
    ).toBe(code);
    for (const controller of ['grblhal', 'grbl', 'duet', 'marlin'] as const) {
        const settings = {
            ...controllerPreset(controller),
            laserConfirmed: true,
        };
        const mapped = exportToolpaths(
            [path(setup({ axis: 'Z' }))],
            'rotary',
            false,
            'metric',
            settings,
        );
        expect(mapped).toMatch(/G1 X30 Z31\.831/);
        expect(mapped).not.toMatch(/^G93$/m);
    }
});
test('unsupported profiles, mixed setups and corrupt calibration cannot export', () => {
    expect(() =>
        exportToolpaths(
            [path(setup({ axis: 'A' }))],
            'rotary',
            false,
            'metric',
            controllerPreset('grbl'),
        ),
    ).toThrow('grblHAL');
    expect(() =>
        exportToolpaths(
            [path(setup({ axis: 'A' }))],
            'rotary',
            false,
            'imperial',
        ),
    ).toThrow('metric');
    expect(() =>
        exportToolpaths(
            [path(), path(setup({ reverse: true }))],
            'rotary',
            false,
            'metric',
        ),
    ).toThrow('one laser rotary');
    for (const extra of [
        { objectDiameter: 0 },
        { rollerDiameter: NaN },
        { unitsPerTurn: Infinity },
        { axis: 'X' },
        { reverse: 'false' },
    ])
        expect(() => setup(extra)).toThrow('rotary');
});

test('uncalibrated rotary settings cannot produce a machine program', () => {
    expect(() =>
        exportToolpaths(
            [path(setup({ confirmed: false }))],
            'job',
            false,
            'metric',
        ),
    ).toThrow('calibration');
});

test('flat Grbl-family jobs reset feed mode after an interrupted inverse-time job', () => {
    const p = path();
    delete (p as { laserRotary?: unknown }).laserRotary;
    const code = exportToolpaths([p], 'flat', false, 'metric');
    expect(code.indexOf('G94')).toBeGreaterThan(-1);
    expect(code.indexOf('G94')).toBeLessThan(code.indexOf('G1 '));
});
test('calibration that loses surface detail at the selected output precision is rejected', () => {
    expect(() =>
        exportToolpaths(
            [path(setup({ unitsPerTurn: 0.001, objectDiameter: 1000000 }))],
            'job',
            false,
            'metric',
        ),
    ).toThrow('precision');
});
