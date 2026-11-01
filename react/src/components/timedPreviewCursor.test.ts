import {
    estimateProgramTime,
    type TimingSettings,
} from '../gcode/estimateTime';
import { createTimedPreviewCursor } from './timedPreviewCursor';

const settings: TimingSettings = {
    maxSpeed: [6000, 6000, 6000],
    acceleration: [100, 100, 100],
    start: [0, 0, 0],
    junctionDeviation: 0.01,
};
async function model(
    code: string,
    start: [number, number, number] = [0, 0, 0],
) {
    return (
        await estimateProgramTime(
            code,
            { ...settings, start },
            'P-seconds',
            () => {},
            true,
        )
    ).playback!;
}
test('samples acceleration, cruise and braking analytically rather than by line fraction', async () => {
    const plan = await model('G1 X100 F600'),
        cursor = createTimedPreviewCursor(plan);
    expect(cursor.sample(0)!.position.x).toBe(0);
    expect(cursor.sample(0.05)!.position.x).toBeCloseTo(0.125, 8);
    expect(cursor.sample(0.1)!.position.x).toBeCloseTo(0.5, 8);
    expect(cursor.sample(5.05)!.position.x).toBeCloseTo(50, 8);
    expect(cursor.sample(10.05)!.position.x).toBeCloseTo(99.875, 8);
    expect(cursor.sample(plan.seconds)!.position.x).toBeCloseTo(100, 8);
    expect(cursor.sample(plan.seconds)!.completedLines).toBe(1);
    expect(cursor.sample(0.1)!.completedLines).toBe(0);
    expect(cursor.sample(NaN)).toBeNull();
});
test('holds the cursor at dwell, then resumes at the next block from the selected initial position', async () => {
    const plan = await model('G1 X110 F600\nG4 P2\nG1 Y10', [100, 0, 0]);
    const cursor = createTimedPreviewCursor(plan);
    expect(cursor.sample(0)!.position).toEqual({ x: 100, y: 0, z: 0 });
    expect(cursor.sample(2)!.position).toEqual({ x: 110, y: 0, z: 0 });
    expect(cursor.sample(2)!.completedLines).toBe(1);
    expect(cursor.sample(3.15)!.position.y).toBeCloseTo(0.125, 8);
    expect(cursor.sample(Infinity)).toBeNull();
});
test('arc cursor remains on the physical curve and all chunk boundary endpoints are retained', async () => {
    const plan = await model('G3 X0 Y10 I-10 F600', [10, 0, 0]);
    const cursor = createTimedPreviewCursor(plan);
    const midpoint = cursor.sample(plan.seconds / 2)!.position;
    expect(Math.hypot(midpoint.x, midpoint.y)).toBeCloseTo(10, 3);
    expect(midpoint.x).toBeCloseTo(midpoint.y, 3);
    const code = Array.from(
        { length: 17000 },
        (_, i) => 'G1 X' + (i + 1) + ' F600',
    ).join('\n');
    const large = await model(code),
        largeCursor = createTimedPreviewCursor(large);
    expect(large.chunks.length).toBe(2);
    expect(large.chunks[1].values.length).toBe((17000 - 16384) * 8);
    expect(largeCursor.sample(large.seconds)!.position.x).toBeCloseTo(17000, 6);
});
test('playback retains the same estimate and rejects inconsistent buffers', async () => {
    const code = 'G1 X10 F600\nY10\nM5';
    const plain = await estimateProgramTime(code, settings);
    const plan = await model(code);
    expect(plan.seconds).toBe(plain.seconds);
    expect(() =>
        createTimedPreviewCursor({ ...plan, blockCount: plan.blockCount + 1 }),
    ).toThrow('buffers');
});
