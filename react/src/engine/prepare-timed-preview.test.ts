import {
    estimateProgramTime,
    type TimingSettings,
} from '../gcode/estimateTime';
import { prepareTimedPreview } from './prepare-timed-preview';
import { SEGMENT_ATTR_RAPID } from '@sienci/gviewer';
const settings: TimingSettings = {
    maxSpeed: [6000, 6000, 6000],
    acceleration: [100, 100, 100],
    start: [10, 20, 0],
    junctionDeviation: 0.01,
};
test('packed geometry starts at the stated work position, preserves source lines, modal power and rapid flags', async () => {
    const code = 'G21\nG90\nM4 S0\nG0 X20\nG1 X30 S250 F600\nG4 P2\nM5\nG1 Y30';
    const result = await estimateProgramTime(
        code,
        settings,
        'P-seconds',
        () => {},
        true,
    );
    const preview = await prepareTimedPreview(code, result.playback!, 500);
    const data = preview.geometry,
        chunk = data.chunks[0];
    expect(data.totalVertices).toBe(6);
    expect(data.maxPower).toBe(500);
    expect([...new Float32Array(chunk.positions)]).toEqual([
        10, 20, 0, 20, 20, 0, 20, 20, 0, 30, 20, 0, 30, 20, 0, 30, 30, 0,
    ]);
    expect([...new Uint8Array(chunk.attrs)]).toEqual([
        SEGMENT_ATTR_RAPID,
        SEGMENT_ATTR_RAPID,
        0,
        0,
        0,
        0,
    ]);
    expect([...new Float32Array(chunk.power!)]).toEqual([0, 0, 250, 250, 0, 0]);
    expect([...new Uint32Array(data.prefixEndVertex)]).toEqual([
        0, 0, 0, 2, 4, 4, 4, 6,
    ]);
});
test('full circles are drawable with every chord attached to the original program line', async () => {
    const code = 'M4 S500\nG2 I-10 F600';
    const result = await estimateProgramTime(
        code,
        { ...settings, start: [10, 0, 0] },
        'P-seconds',
        () => {},
        true,
    );
    const { geometry } = await prepareTimedPreview(code, result.playback!);
    expect(geometry.totalVertices).toBeGreaterThan(600);
    const prefix = new Uint32Array(geometry.prefixEndVertex);
    expect([...prefix]).toEqual([0, geometry.totalVertices]);
    const points = new Float32Array(geometry.chunks[0].positions);
    for (let i = 0; i < points.length; i += 3)
        expect(Math.hypot(points[i], points[i + 1])).toBeCloseTo(10, 4);
    expect(points[points.length - 3]).toBeCloseTo(10, 6);
});
test('empty and multi-chunk programs retain complete buffer counts', async () => {
    const empty = await estimateProgramTime(
        'M5',
        settings,
        'P-seconds',
        () => {},
        true,
    );
    expect(
        (await prepareTimedPreview('M5', empty.playback!)).geometry
            .totalVertices,
    ).toBe(0);
    const code = Array.from(
        { length: 66000 },
        (_, i) => 'G1 X' + (i % 2 ? 0 : 100) + ' F600',
    ).join('\n');
    const result = await estimateProgramTime(
        code,
        settings,
        'P-seconds',
        () => {},
        true,
    );
    const { geometry } = await prepareTimedPreview(code, result.playback!);
    expect(geometry.chunks.length).toBe(2);
    expect(
        geometry.chunks.reduce((sum, chunk) => sum + chunk.vertexCount, 0),
    ).toBe(geometry.totalVertices);
    expect(new Uint32Array(geometry.prefixEndVertex)[65999]).toBe(
        geometry.totalVertices,
    );
});

test('dwell S seconds are separate from modal laser S power', async () => {
    const code = 'M4 S500\nG1 X20 F600\nG4 S2\nG1 X30';
    const result = await estimateProgramTime(
        code,
        settings,
        'S-seconds',
        () => {},
        true,
    );
    const { geometry } = await prepareTimedPreview(code, result.playback!);
    expect(
        geometry.chunks.flatMap((chunk) => [...new Float32Array(chunk.power!)]),
    ).toEqual([500, 500, 500, 500]);
});
