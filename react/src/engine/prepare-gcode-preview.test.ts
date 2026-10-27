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
