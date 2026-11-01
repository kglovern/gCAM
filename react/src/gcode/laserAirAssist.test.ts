import { createLaserToolpath } from '../cam/laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { controllerPreset, validateOutput, DEFAULT_OUTPUT } from './profiles';
import { exportToolpaths } from './exportToolpaths';
import { renderProgram } from './renderProgram';
const make = (airAssist = true) =>
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
            laserOptions: { airAssist },
        }),
    );
test('default laser assist remains M8/M9 at operation boundaries and is absent when disabled', () => {
    const output = exportToolpaths(
        [make(), make(false)],
        'air',
        false,
        'metric',
    );
    expect(output.match(/^M8$/gm)).toHaveLength(1);
    expect(output.match(/^M9$/gm)).toHaveLength(1);
    expect(output.indexOf('M8')).toBeLessThan(output.indexOf('G1 X10'));
    expect(output.indexOf('M9')).toBeGreaterThan(output.indexOf('M5'));
    expect(exportToolpaths([make(false)], 'air', false, 'metric')).not.toMatch(
        /M8|M9/,
    );
});
test('dedicated laser blocks support configured M7 without modifying milling coolant blocks', () => {
    const settings = controllerPreset();
    settings.blocks.laserAirOn = 'M7';
    settings.blocks.laserAirOff = 'M9';
    settings.blocks.coolantOn = '(Milling coolant on)';
    settings.blocks.coolantOff = '(Milling coolant off)';
    const output = exportToolpaths([make()], 'mist', false, 'metric', settings);
    expect(output).toMatch(/^M7$/m);
    expect(output).not.toMatch(/^M8$/m);
    expect(output).not.toContain('Milling coolant');
    const milling = renderProgram(
        'G21\nG90\nG17\nM3 S12000\nG1 X10 F600\nM5',
        settings,
    );
    expect(milling).toContain('Milling coolant on');
    expect(milling).toContain('Milling coolant off');
    expect(milling).not.toMatch(/^M7$/m);
});
test('custom fan/relay commands keep resolved output values and do not undergo laser-power rescaling', () => {
    const settings = { ...controllerPreset('duet'), laserConfirmed: true };
    settings.blocks.laserAirOn = 'M106 P1 S1\n(Air {operationName})';
    settings.blocks.laserAirOff = 'M106 P1 S0';
    const output = exportToolpaths([make()], 'fan', false, 'metric', settings);
    expect(output).toContain('M106 P1 S1');
    expect(output).toContain('M106 P1 S0');
    expect(output).toContain('; Air Laser Cut');
    expect(output).toContain('S102');
    expect(output).not.toMatch(/^M8$|^M9$/m);
});
test('empty dedicated blocks emit no assist commands, including when comments are disabled', () => {
    const settings = controllerPreset();
    settings.blocks.laserAirOn = '';
    settings.blocks.laserAirOff = '';
    settings.comments = 'none';
    const output = exportToolpaths(
        [make()],
        'external',
        false,
        'metric',
        settings,
    );
    expect(output).not.toMatch(/M7|M8|M9/);
    expect(output).toContain('S400');
});
test('older settings gain only the new default fields and preserve default mill byte compatibility', () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_OUTPUT));
    delete legacy.blocks.laserAirOn;
    delete legacy.blocks.laserAirOff;
    const before = JSON.stringify(legacy);
    expect(validateOutput(legacy)).toEqual(DEFAULT_OUTPUT);
    expect(JSON.stringify(legacy)).toBe(before);
    const canonical =
        '(mill)\nG21\nG90\nG17\nG0 Z5\nT1 M6\nM3 S12000\nG1 X1.2300 F600\nM5\nM30';
    expect(renderProgram(canonical, legacy)).toBe(canonical + '\n');
    legacy.blocks.laserAirOn = null;
    expect(() => validateOutput(legacy)).toThrow(/Invalid/);
});
test('air blocks obey the same units/mode validation as other templates', () => {
    const settings = controllerPreset();
    settings.blocks.laserAirOn = 'G91\nG0 X25.4\nG90\nM7';
    expect(
        exportToolpaths([make()], 'units', false, 'imperial', settings),
    ).toContain('G0 X1');
    settings.blocks.laserAirOn = 'G91\nM7';
    expect(() =>
        exportToolpaths([make()], 'bad', false, 'metric', settings),
    ).toThrow(/restoring G90/);
});
