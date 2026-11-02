import { createLaserToolpath } from '../laser.js';
import { makeToolpathConfig } from '../../toolpaths/toolpathRequest';
import { exportToolpaths } from '../../gcode/exportToolpaths';
import { controllerPreset } from '../../gcode/profiles';
import { prepareGcodePreview } from '../../engine/prepare-gcode-preview';
import { SEGMENT_ATTR_RAPID } from '@sienci/gviewer';

const points = Array.from({ length: 201 }, (_, index) => {
    const angle = index === 200 ? 0 : (index * Math.PI) / 100;
    return { x: 30 + 10 * Math.cos(angle), y: 30 + 10 * Math.sin(angle) };
});
const make = (extra = {}) =>
    createLaserToolpath(
        [{ points }],
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: extra,
        }),
    );

test.each(['grblhal', 'grbl', 'duet', 'marlin'] as const)(
    'exports circular laser cuts for %s using the controller arc switch',
    (id) => {
        const settings = { ...controllerPreset(id), laserConfirmed: true };
        const job = make();
        const before = JSON.stringify(job);
        const code = exportToolpaths([job], 'circle', true, 'metric', settings);
        if (settings.arcs) expect(code).toMatch(/G[23] .*I-?\d/);
        else expect(code).not.toMatch(/G[23] /);
        expect(code).not.toMatch(/G[01] Z|M6/);
        expect(JSON.stringify(job)).toBe(before);
        expect(
            exportToolpaths([job], 'circle', false, 'metric', settings),
        ).not.toMatch(/G[23] /);
        expect(
            exportToolpaths([job], 'circle', true, 'metric', {
                ...settings,
                arcs: false,
            }),
        ).not.toMatch(/G[23] /);
    },
);

test('retains beam-off bridges, repeated passes, winding, bounds and viewer power', async () => {
    const job = make({
        bridges: true,
        bridgeCount: 4,
        bridgeWidth: 1,
        passes: 2,
    });
    const code = exportToolpaths([job], 'bridges', true, 'metric');
    const linear = exportToolpaths([job], 'bridges', false, 'metric');
    expect(code.length).toBeLessThan(linear.length / 2);
    expect(code).toMatch(/G1 .* S0/);
    const preview = await prepareGcodePreview(code);
    const reference = await prepareGcodePreview(linear);
    function metrics(data: typeof preview) {
        let off = 0,
            on = 0,
            minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const chunk of data.chunks) {
            const coordinates = new Float32Array(chunk.positions);
            const powers = new Float32Array(chunk.power!);
            const attrs = new Uint8Array(chunk.attrs);
            for (let index = 0; index < chunk.vertexCount; index += 2) {
                if (attrs[index] & SEGMENT_ATTR_RAPID) continue;
                const a = index * 3,
                    b = a + 3;
                const length = Math.hypot(
                    coordinates[b] - coordinates[a],
                    coordinates[b + 1] - coordinates[a + 1],
                );
                if (powers[index] === 0) off += length;
                else {
                    expect(powers[index]).toBe(400);
                    on += length;
                }
                for (const offset of [a, b]) {
                    minX = Math.min(minX, coordinates[offset]);
                    maxX = Math.max(maxX, coordinates[offset]);
                    minY = Math.min(minY, coordinates[offset + 1]);
                    maxY = Math.max(maxY, coordinates[offset + 1]);
                }
            }
        }
        return { off, on, minX, minY, maxX, maxY };
    }
    const actual = metrics(preview),
        expected = metrics(reference);
    for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const)
        expect(Math.abs(actual[key] - expected[key])).toBeLessThan(0.02);
    expect(actual.off).toBeCloseTo(expected.off, 2);
    expect(Math.abs(actual.on - expected.on)).toBeLessThan(0.1);
});

test('keeps lead and overcut moves on their existing path', () => {
    for (const extra of [
        { overcut: 1 },
        { leadInLength: 1, leadOutLength: 1 },
    ]) {
        const job = make(extra);
        const code = exportToolpaths([job], 'leads', true, 'metric');
        expect(code).not.toMatch(/G[23] /);
    }
});
