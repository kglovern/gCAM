import { validateLaserRotary } from '../cam/laser-rotary.js';
import { laserRotaryPreviewLines } from './laser-rotary-preview';
import {
    buildToolpathGeometryFromLinesBatched,
    SEGMENT_ATTR_RAPID,
} from '@sienci/gviewer';
import { prepareGcodePreview } from './prepare-gcode-preview';

test.each([
    'G21\nG90\nG0 X10 Y0 Z5\nG1 Z0 F100\nG2 X0 Y10 I-10 J0\nG1 X5 Y5 Z2 A90\nM2',
    'G20\nG91\nG0 X1 Y1\nG1 X1 Z-0.25 F10\nG1 Y1\n',
    '; no motion\nM2',
])(
    'worker layout preserves the library parser geometry and line indexing: %s',
    async (gcode) => {
        const lines = gcode.split(/\r?\n/);
        const expected = await buildToolpathGeometryFromLinesBatched(lines, {
            arcSegments: 30,
        });
        const data = await prepareGcodePreview(gcode);
        const actual = [[], []] as number[][];
        for (const chunk of data.chunks) {
            const positions = new Float32Array(chunk.positions);
            const attrs = new Uint8Array(chunk.attrs);
            for (let i = 0; i < chunk.vertexCount; i++)
                actual[attrs[i] & SEGMENT_ATTR_RAPID ? 0 : 1].push(
                    ...positions.subarray(i * 3, i * 3 + 3),
                );
        }
        expect(actual[0]).toEqual(Array.from(expected.rapid.positions));
        expect(actual[1]).toEqual(
            expected.cuts.flatMap((s) => Array.from(s.positions)),
        );
        const prefix = new Uint32Array(data.prefixEndVertex);
        for (let line = 0; line < lines.length; line++)
            expect(prefix[line]).toBe(
                expected.rapid.prefixEndVertex[line] +
                    expected.cuts.reduce(
                        (sum, s) => sum + s.prefixEndVertex[line],
                        0,
                    ),
            );
    },
);

test('large files use bounded GPU chunks without dropping segments', async () => {
    const gcode =
        'G21\nG90\n' +
        Array.from(
            { length: 70000 },
            (_, i) => `G1 X${i % 100} Y${i % 17} Z1 F100`,
        ).join('\n');
    const data = await prepareGcodePreview(gcode);
    expect(data.chunks.length).toBeGreaterThan(1);
    expect(data.chunks.reduce((sum, chunk) => sum + chunk.vertexCount, 0)).toBe(
        data.totalVertices,
    );
    for (const chunk of data.chunks) {
        expect(chunk.vertexCount).toBeLessThanOrEqual(131072);
        expect(chunk.vertexCount % 2).toBe(0);
    }
    const prefix = new Uint32Array(data.prefixEndVertex);
    expect(prefix[prefix.length - 1]).toBe(data.totalVertices);
}, 30000);

test('laser segments retain modal S values including off moves and configured maximum', async () => {
    const code = 'M4 S0\nG0 X0 Y0\nG1 X1 S250 F1000\nG1 X2 S500\nM5\nG1 X3';
    const data = await prepareGcodePreview(code, () => {}, {
        laser: true,
        laserMax: 2000,
    });
    expect(data.isLaser).toBe(true);
    expect(data.maxPower).toBe(2000);
    const powers = data.chunks.flatMap((c) =>
        Array.from(new Float32Array(c.power!)),
    );
    expect(powers).toContain(250);
    expect(powers).toContain(500);
    expect(powers.slice(-2)).toEqual([0, 0]);
});

test('fractional controller S maxima stay fractional for truthful opacity', async () => {
    const result = await prepareGcodePreview(
        'M4 S0\nG1 X10 S0.125 F1000',
        () => {},
        { laser: true, laserMax: 0.5 },
    );
    expect(result.maxPower).toBe(0.5);
});

test('rotary preview decodes actual A output to physical surface distance without losing power or line indices', async () => {
    const setup = validateLaserRotary({
        type: 'chuck',
        axis: 'A',
        objectDiameter: 40,
        rollerDiameter: 10,
        unitsPerTurn: 360,
        reverse: false,
        confirmed: true,
    })!;
    const code =
        'G21\nG90\nM4 S0\nG0 X0 A0\nG93\nG1 X30 A114.5916 S250 F20\nG94\nM5';
    const lines = laserRotaryPreviewLines(code.split('\n'), setup);
    expect(lines).toHaveLength(code.split('\n').length);
    expect(lines[5]).toMatch(/Y40\.000/);
    expect(lines[5]).toMatch(/F1000\.000/);
    const actual = await prepareGcodePreview(code, () => {}, {
        laser: true,
        laserMax: 1000,
        laserRotary: setup,
    });
    const expected = await prepareGcodePreview(
        'G21\nG90\nM4 S0\nG0 X0 Y0\nG94\nG1 X30 Y40 S250 F1000\nG94\nM5',
        () => {},
        { laser: true, laserMax: 1000 },
    );
    const positions = (data: typeof actual) =>
        data.chunks.flatMap((c) => Array.from(new Float32Array(c.positions)));
    expect(positions(actual)).toHaveLength(positions(expected).length);
    positions(actual).forEach((v, i) =>
        expect(v).toBeCloseTo(positions(expected)[i], 3),
    );
    expect(Array.from(new Float32Array(actual.chunks[0].power!))).toContain(
        250,
    );
    expect(new Uint32Array(actual.prefixEndVertex)).toHaveLength(
        code.split('\n').length,
    );
});

test('reversed Z rotary preview retains physical dimensions in imperial output', async () => {
    const setup = validateLaserRotary({
        type: 'roller',
        axis: 'Z',
        objectDiameter: 80,
        rollerDiameter: 20,
        unitsPerTurn: Math.PI * 20,
        reverse: true,
        confirmed: true,
    })!;
    const lines = laserRotaryPreviewLines(
        ['G20', 'G90', 'M4 S0', 'G0 X0 Z0', 'G1 X1 Z-1 S500 F10'],
        setup,
    );
    expect(lines[4]).toContain('Y1');
    const actual = await prepareGcodePreview(lines.join('\n'), () => {}, {
        laser: true,
    });
    const numbers = actual.chunks.flatMap((c) =>
        Array.from(new Float32Array(c.positions)),
    );
    expect(Math.max(...numbers)).toBeCloseTo(25.4, 3);
});

test('dwell S seconds do not overwrite the modal laser power', async () => {
    const data = await prepareGcodePreview(
        'M4 S500\nG1 X10 F600\nG4 S2\nG1 X20',
        () => {},
        { laser: true },
    );
    expect(
        data.chunks.flatMap((chunk) => [...new Float32Array(chunk.power!)]),
    ).toEqual([500, 500, 500, 500]);
});

test.each([
    ['G90', 'G91.1', 10, 30],
    ['G91.0', 'G90.1', 20, 60],
])(
    'rotary %s axes remain unchanged by %s arc-centre mode, including inverse-time feed',
    async (distance, arcMode, step, lastX) => {
        const setup = validateLaserRotary({
            type: 'chuck',
            axis: 'A',
            objectDiameter: 40,
            rollerDiameter: 10,
            unitsPerTurn: 360,
            reverse: false,
            confirmed: true,
        })!;
        const baseline = [
            'G21',
            String(distance),
            'G93',
            'G0 X10 A0',
            'G1 X20 A90 F2',
            'G1 X30 A180 F2',
        ];
        const withArcMode = [
            ...baseline.slice(0, 4),
            String(arcMode),
            ...baseline.slice(4),
        ];
        const first = laserRotaryPreviewLines(baseline, setup);
        const second = laserRotaryPreviewLines(withArcMode, setup);
        expect(second.slice(5)).toEqual(first.slice(4));
        const feed = Number(second[5].match(/F([0-9.]+)/)![1]);
        expect(feed).toBeCloseTo(2 * Math.hypot(Number(step), 10 * Math.PI), 8);
        const geometry = await prepareGcodePreview(
            withArcMode.join('\n'),
            () => {},
            { laser: true, laserRotary: setup },
        );
        const points = geometry.chunks.flatMap((chunk) => [
            ...new Float32Array(chunk.positions),
        ]);
        expect(points[points.length - 3]).toBe(lastX);
    },
);
