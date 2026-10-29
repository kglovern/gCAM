import { toGcode } from './gcode';
import { renderProgram } from '../../gcode/renderProgram';
import { controllerPreset } from '../../gcode/profiles';

test('legacy XZA paths can export timed angular moves without scaling the inverse feed', () => {
    const code = toGcode(
        [
            { x: 0, z: 10, a: 0, rapid: true, op: 'rough' },
            { x: 10, z: 10, a: 180, f: 600, op: 'rough' },
        ],
        {
            stock: { length: 100, diameter: 20, grip: 10, ext: false },
            tool: {
                type: 'flat',
                dia: 3,
                feed: 600,
                plunge: 100,
                spindle: 12000,
                slotNum: 1,
            },
            name: 'timing',
            mode: 'profile',
            compR: 0,
            inverseTime: true,
        },
    );
    const cut = code.split(/\r?\n/).find((line) => /^G1[XYZA]/.test(line))!;
    const f = Number(cut.match(/F([\d.]+)/)![1]);
    expect(f).toBeLessThanOrEqual(600 / Math.hypot(10, Math.PI * 10));
    expect(f).toBeCloseTo(600 / Math.hypot(10, Math.PI * 10), 5);
    expect(
        renderProgram(code, controllerPreset('mach4'), 'metric', {
            rotary: true,
        }),
    ).toContain(`F${cut.split('F')[1]}`);
    expect(code).toMatch(/G94\r\nG0Z/);
});
