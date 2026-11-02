import { renderProgram } from './renderProgram';
import { renderProgram as reference } from '../../scripts/fixtures/render-program-reference';
import { controllerPreset, type ControllerId } from './profiles';
const laser =
    '(Laser Cut - first)\nG21\nG90\nG17\nM4 S0\nG0 X0 Y0\nG1 X10.1234 S500 F600\nG1 Y25.4 S0\nM5\n(Laser Cut - first)\nM3 S0\nG0 X10 Y20 S0\nG1 X20 S113 F1200\nM5\nM30';
const mill =
    '(job)\nG21\nG90\nG17\nG0 Z5\nT1 M6\nM3 S12000\nG1 X25.4 Y0 F254\nG0 Z5\nM5\nM30';
const controllers: ControllerId[] = [
    'grblhal',
    'grbl',
    'marlin',
    'duet',
    'linuxcnc',
    'mach3',
    'mach4',
];
function result(
    fn: typeof renderProgram,
    code: string,
    settings: Parameters<typeof renderProgram>[1],
    units: Parameters<typeof renderProgram>[2],
    context: Parameters<typeof renderProgram>[3],
) {
    try {
        return { code: fn(code, settings, units, context) };
    } catch (error) {
        return { error: String(error) };
    }
}
test('all presets, units, comment policies and coordinate precision retain exact output or errors', () => {
    for (const id of controllers)
        for (const units of ['metric', 'imperial'] as const)
            for (const comments of [
                'parentheses',
                'semicolon',
                'none',
            ] as const)
                for (const decimals of [3, 5, 6]) {
                    const settings = {
                        ...controllerPreset(id),
                        laserConfirmed: true,
                        comments,
                        decimals,
                    };
                    for (const [code, context] of [
                        [mill, {}],
                        [laser, { laser: true }],
                    ] as const)
                        expect(
                            result(
                                renderProgram,
                                code,
                                settings,
                                units,
                                context,
                            ),
                        ).toEqual(
                            result(reference, code, settings, units, context),
                        );
                }
});
test('comments, casing, repeated words, exponent-like text and inverse-time state retain the old semantics', () => {
    const snippets = [
        'T1',
        'T1 S0',
        '(outer (inner) end) G1 X1.2500 Y-0.0000 S500 F1200 ; tail',
        'G1 X1 (unfinished',
        'G1 X1 ) unmatched',
        'g1 x25.4 y0 s500 f254',
        'G1 X1 S100 S200 F600',
        'G1 X1 S0001 F600',
        'G1 X1 S-1 F600',
        'G1 X1 S1001 F600',
        'F3 G93\nG1 X25.4 F4.123456\nF254 G94\nG1 X50.8 F254',
        'G093 F4.123456\nG+94.0 F254',
        'G1 X1e3 S1e2 F600',
        'G1 X' + '9'.repeat(400),
    ];
    for (const text of snippets)
        for (const units of ['metric', 'imperial'] as const) {
            const settings = {
                ...controllerPreset('grblhal'),
                comments: 'semicolon' as const,
                decimals: 4,
            };
            const code = 'G21\nG90\nM4 S0\n' + text + '\nM5';
            expect(
                result(renderProgram, code, settings, units, { laser: true }),
            ).toEqual(
                result(reference, code, settings, units, { laser: true }),
            );
        }
});
test('same-name operations, template commands, constant mode and rotary feed precision retain exact behavior', () => {
    const settings = controllerPreset('grblhal');
    settings.blocks.operationStart = '(Start {operationName})\nG91\nG0 X1\nG90';
    settings.blocks.laserStart = 'M{laserMode} S0';
    const operations = ['dynamic', 'constant'].map((laserPowerMode) => ({
        marker: '(Laser Cut - first)',
        name: 'first',
        values: { laserPowerMode },
    }));
    expect(
        renderProgram(laser, settings, 'metric', { laser: true, operations }),
    ).toBe(reference(laser, settings, 'metric', { laser: true, operations }));
    const rotary =
        'G21\nG90\nG17\nM4 S0\nG94\nG0 X0 A0\nG93\nG1 X1 A90 S500 F0.12345678\nG94\nM5';
    expect(
        renderProgram(rotary, settings, 'metric', {
            laser: true,
            rotary: true,
        }),
    ).toBe(
        reference(rotary, settings, 'metric', { laser: true, rotary: true }),
    );
});

test('standalone tool words retain milling controller handling', () => {
    const code = 'G21\nG90\nG17\nT1\nM6\nM3 S12000\nG1 X25.4 F254\nM5';
    for (const id of controllers) {
        const settings = { ...controllerPreset(id), decimals: 4 };
        expect(result(renderProgram, code, settings, 'metric', {})).toEqual(
            result(reference, code, settings, 'metric', {}),
        );
    }
});
