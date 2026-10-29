import {
    controllerPreset,
    validateOutput,
    loadOutput,
    OUTPUT_STORAGE_KEY,
    type ControllerId,
} from './profiles';
import { expandBlock, renderProgram } from './renderProgram';

const mill =
    '(job)\nG21\nG90\nG17\nG0 Z5\nT1 M6 (Tool 1)\nM3 S12000\nG1 X25.4 Y0 F254\nG0 Z5\nM5\nM30';
const laser =
    'G21\nG90\nG17\nM4 S0\nG0 X0 Y0\nG1 X10 S500 F600\nG1 X20\nG0 X30\nG1 X40\nM5\nM30';

test('default grblHAL preserves existing planar output with a final newline', () => {
    expect(renderProgram(mill, controllerPreset())).toBe(mill + '\n');
});
test.each([
    'grblhal',
    'grbl',
    'duet',
    'marlin',
    'linuxcnc',
    'mach3',
    'mach4',
] as ControllerId[])(
    '%s preset emits one-tool milling without controller settings or homing',
    (id) => {
        const code = renderProgram(mill, controllerPreset(id));
        expect(code).toContain('G90');
        expect(code).toContain('M3');
        expect(code).toContain('M5');
        expect(code).not.toMatch(/\$\d+=|G28|G53/);
        if (id === 'marlin') expect(code).not.toMatch(/G21|G17|M30|M6/);
        if (id === 'grbl') expect(code).not.toContain('M6');
        if (id === 'duet') expect(code).toContain('M3 P0 S12000');
        if (id === 'mach4') expect(code).toMatch(/M30\r\n$/);
    },
);
test('two-tool requests preserve stop ordering and use Duet tool selection without implementing a procedure', () => {
    const two = mill.replace('M30', 'T2 M6\nM3 S9000\nG1 X30 F100\nM5\nM30');
    expect(renderProgram(two, controllerPreset())).toMatch(
        /M5\nT2 M6\nM3 S9000/,
    );
    expect(renderProgram(two, controllerPreset('duet'))).toMatch(
        /M5\nT2\nM3 P0 S9000/,
    );
    expect(() => renderProgram(two, controllerPreset('grbl'))).toThrow(
        'individual toolpaths',
    );
    expect(() => renderProgram(two, controllerPreset('marlin'))).toThrow(
        'individual toolpaths',
    );
});
test.each([
    ['P-seconds', 'G4 P2'],
    ['P-milliseconds', 'G4 P2000'],
    ['S-seconds', 'G4 S2'],
] as const)('dwell conversion %s', (dwell, expected) => {
    const settings = { ...controllerPreset(), dwell, delaySeconds: 2 };
    expect(renderProgram(mill, settings)).toContain(`M3 S12000\n${expected}\n`);
});
test('inch conversion leaves comments, spindle speed and inverse-time feed independent', () => {
    const code = renderProgram(mill, controllerPreset(), 'imperial');
    expect(code).toContain('G20');
    expect(code).toContain('X1 Y0 F10');
    expect(code).toContain('S12000');
    const inverse = 'G21\nG90\nG17\nG93\nG1 X25.4 A90 F4.123456\nG94\nM2';
    const rotary = renderProgram(
        inverse,
        controllerPreset('linuxcnc'),
        'imperial',
        { rotary: true },
    );
    expect(rotary).toContain('G1 X1 A90 F4.123456');
    expect(rotary).toContain('G94');
});
test.each(['grblhal', 'grbl', 'duet', 'marlin'] as ControllerId[])(
    '%s laser scales power and restores it after unpowered travel',
    (id) => {
        const settings = {
            ...controllerPreset(id),
            laserConfirmed: true,
            laserMax: 200,
        };
        const code = renderProgram(laser, settings, 'metric', { laser: true });
        expect(code).toContain('G1 X10 S100 F600');
        if (id === 'duet' || id === 'marlin') {
            expect(code).toContain('G1 X20 S100');
            expect(code).toContain('G1 X40 S100');
        }
        if (id === 'duet') expect(code).toContain('G1 S0\nG0 X30');
        if (id === 'marlin') expect(code).toContain('M5 I');
    },
);
test('unconfigured laser and unsupported laser/rotary profiles fail explicitly', () => {
    expect(() =>
        renderProgram(laser, controllerPreset('marlin'), 'metric', {
            laser: true,
        }),
    ).toThrow('Confirm');
    for (const id of ['linuxcnc', 'mach3', 'mach4'] as ControllerId[])
        expect(() =>
            renderProgram(laser, controllerPreset(id), 'metric', {
                laser: true,
            }),
        ).toThrow('synchronized');
    for (const id of ['grbl', 'marlin'] as ControllerId[])
        expect(() =>
            renderProgram(mill, controllerPreset(id), 'metric', {
                rotary: true,
            }),
        ).toThrow('rotary');
});
test('operation events expand once at each boundary and custom omission is explicit', () => {
    const settings = controllerPreset();
    settings.blocks.operationStart = '(Start {operationName})';
    settings.blocks.operationEnd = '(End {operationName})';
    settings.blocks.end = '';
    const code = renderProgram(
        mill.replace('T1', '(pocket)\nT1').replace('M30', '(finish)\nM30'),
        settings,
        'metric',
        {
            operations: [
                { marker: '(pocket)', name: 'Pocket' },
                { marker: '(finish)', name: 'Finish' },
            ],
        },
    );
    expect(code).toMatch(/\(End Pocket\)\n\(finish\)\n\(Start Finish\)/);
    expect(code).toMatch(/\(End Finish\)\n$/);
    expect(code).not.toContain('M30');
});
test('template errors cannot silently become zero or change motion interpretation', () => {
    expect(() => expandBlock('G0 X{posx}', {})).toThrow('Unknown');
    expect(() => expandBlock('G0 X[posx]', {})).toThrow('sender');
    expect(() => expandBlock('G91\nG0 Z5', {})).toThrow('restoring');
    expect(expandBlock('G91\nG0 Z5\nG90', {})).toHaveLength(3);
    expect(() => expandBlock('G20', {})).toThrow('preserve');
    expect(() => expandBlock('G93', {})).toThrow('preserve');
    expect(() => expandBlock('S{spindleSpeed}', { spindleSpeed: NaN })).toThrow(
        'Invalid',
    );
});
test('corrupt saved/imported profiles fall back only on load; explicit import rejects them', () => {
    expect(() =>
        validateOutput({ ...controllerPreset(), laserMax: -1 }),
    ).toThrow();
    localStorage.setItem(OUTPUT_STORAGE_KEY, '{bad');
    expect(loadOutput().controller).toBe('grblhal');
    localStorage.removeItem(OUTPUT_STORAGE_KEY);
});

test('custom laser commands use configured output values once and missing operation values fail', () => {
    const settings = { ...controllerPreset('marlin'), laserConfirmed: true };
    settings.blocks.laserStart = 'M4 I S{laserMax}';
    const code = renderProgram(laser, settings, 'metric', { laser: true });
    expect(code).toContain('M4 I S255');
    expect(code).toContain('G1 X10 S127.5 F600');
    settings.blocks.start = 'G0 Z{safeZ}';
    expect(() =>
        renderProgram(laser, settings, 'metric', { laser: true }),
    ).toThrow('safeZ');
});

test('laser fallback paths receive a final shutdown even without a canonical M5', () => {
    const settings = { ...controllerPreset('marlin'), laserConfirmed: true };
    expect(
        renderProgram(
            'G21\nG90\nG17\nG1 X10 S500 F600\nM30',
            settings,
            'metric',
            { laser: true },
        ),
    ).toMatch(/M5 I\n$/);
});

test('lowercase custom motion is converted using the same unit rules', () => {
    const settings = controllerPreset();
    settings.blocks.start = 'g0 z25.4';
    expect(renderProgram(mill, settings, 'imperial')).toContain('g0 Z1');
});
