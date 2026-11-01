import { createLaserToolpath, laserOptions } from '../cam/laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from './exportToolpaths';
import { controllerPreset, validateOutput } from './profiles';
import { buildGcode } from '../cam/gcode/program.js';
const make = (powerMode?: string) =>
    createLaserToolpath(
        [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
        ],
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: powerMode
                ? { powerMode: powerMode as 'constant' }
                : {},
        }),
    );
test.each(['grblhal', 'grbl'] as const)(
    '%s explicit modes and repeated same-name operations use the correct starts',
    (controller) => {
        const settings = {
            ...controllerPreset(controller),
            laserConfirmed: true,
        };
        const constant = make('constant'),
            dynamic = make('dynamic'),
            profile = make();
        expect(constant.label).toBe(dynamic.label);
        const code = exportToolpaths(
            [constant, dynamic, profile],
            'modes',
            false,
            'metric',
            settings,
        );
        expect(code.match(/M[34] S0/g)).toEqual(['M3 S0', 'M4 S0', 'M4 S0']);
        expect(code.match(/M5/g)).toHaveLength(3);
        expect(code).not.toMatch(/\$32|\$30/);
        const raw = buildGcode({
            toolpaths: [constant],
            fileName: 'constant',
            forcePolylineArcs: true,
        });
        expect(raw).toContain('M3 S0');
        expect(raw).toContain('G0 X0 Y0 S0');
        expect(raw).not.toContain('G1 S0');
    },
);
test('controller-default legacy jobs retain Grbl output', () => {
    expect(exportToolpaths([make()], 'same', false, 'metric')).toBe(
        exportToolpaths([make('profile')], 'same', false, 'metric'),
    );
});
test('custom blocks opt into operation modes explicitly instead of being silently replaced', () => {
    const settings = controllerPreset();
    settings.blocks.laserStart = 'M{laserMode} S0\n(Custom start)';
    const code = exportToolpaths(
        [make('constant'), make('dynamic')],
        'custom',
        false,
        'metric',
        settings,
    );
    expect(code.match(/M[34] S0/g)).toEqual(['M3 S0', 'M4 S0']);
    expect(code.match(/Custom start/g)).toHaveLength(2);
    settings.blocks.laserStart = 'M4 S0\n(Custom start)';
    expect(() =>
        exportToolpaths(
            [make('constant')],
            'custom',
            false,
            'metric',
            settings,
        ),
    ).toThrow(/laserMode/);
    expect(
        exportToolpaths([make()], 'custom', false, 'metric', settings),
    ).toContain('Custom start');
});
test.each(['duet', 'marlin'] as const)(
    '%s retains its configured default and rejects unverified Grbl-specific modes',
    (controller) => {
        const settings = {
            ...controllerPreset(controller),
            laserConfirmed: true,
        };
        for (const mode of ['dynamic', 'constant'])
            expect(() =>
                exportToolpaths(
                    [make(mode)],
                    'mode',
                    false,
                    'metric',
                    settings,
                ),
            ).toThrow(/Controller default/);
        const code = exportToolpaths(
            [make()],
            'default',
            false,
            'metric',
            settings,
        );
        expect(code).toContain(controller === 'marlin' ? 'M3 I S0' : 'M3 S0');
        expect(code).toContain('S102');
    },
);
test('Marlin default and former exact preset use S-controlled continuous inline mode', () => {
    const settings = { ...controllerPreset('marlin'), laserConfirmed: true };
    settings.blocks.laserStart = 'M4 I S0';
    expect(validateOutput(settings).blocks.laserStart).toBe('M3 I S0');
    const code = exportToolpaths([make()], 'marlin', false, 'metric', settings);
    expect(code).toContain('M3 I S0');
    expect(code).not.toContain('M4 I');
    expect(code).toContain('M5 I');
    for (const block of ['M4 I S{laserMax}', 'M4I S0', 'M4 S0 I']) {
        settings.blocks.laserStart = block;
        expect(() =>
            exportToolpaths([make()], 'marlin', false, 'metric', settings),
        ).toThrow(/feed rate/);
    }
});
test('invalid power modes are rejected during planning and saved-path export', () => {
    expect(() => laserOptions({ powerMode: 'other' })).toThrow(/power control/);
    const path = make();
    path.laserOptions.powerMode = 'other';
    expect(() => exportToolpaths([path], 'bad', false, 'metric')).toThrow(
        /power control/,
    );
});
