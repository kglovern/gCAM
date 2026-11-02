import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { estimateProgramTime } from '../gcode/estimateTime';
import { usePreviewPlayback } from './usePreviewPlayback';

let frames, next, viewer, raf, caf;
const segments = () => ({
    chunks: [
        {
            vertexCount: 2,
            positions: new Float32Array([0, 0, 0, 10, 20, 0]).buffer,
        },
    ],
    totalVertices: 2,
    prefixEndVertex: new Uint32Array(101).fill(2, 1).buffer,
});
beforeEach(() => {
    frames = new Map();
    next = 0;
    raf = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
            frames.set(++next, callback);
            return next;
        });
    caf = jest
        .spyOn(window, 'cancelAnimationFrame')
        .mockImplementation((id) => frames.delete(id));
    viewer = {
        current: Object.fromEntries(
            [
                'seekToLine',
                'showAll',
                'resetColors',
                'setBitVisible',
                'setBitPosition',
                'setBitSpinning',
            ].map((key) => [key, jest.fn()]),
        ),
    };
});
afterEach(() => {
    raf.mockRestore();
    caf.mockRestore();
});
function step(time) {
    const batch = [...frames.values()];
    frames.clear();
    act(() => batch.forEach((callback) => callback(time)));
}

test('plays by line rate, scrubbing pauses, and reset restores all colours', () => {
    const { result } = renderHook(() => usePreviewPlayback(viewer));
    act(() => result.current.load(segments()));
    act(() => result.current.play());
    step(0);
    step(500);
    expect(result.current.line).toBe(50);
    expect(result.current.playing).toBe(true);
    act(() => result.current.seek(80));
    expect(result.current.playing).toBe(false);
    expect(frames.size).toBe(0);
    expect(viewer.current.seekToLine).toHaveBeenLastCalledWith(79, 'grey');
    expect(viewer.current.setBitPosition).toHaveBeenLastCalledWith(
        { x: 10, y: 20, z: 0 },
        { immediate: true },
    );
    act(() => result.current.reset());
    expect(result.current.line).toBe(0);
    expect(viewer.current.resetColors).toHaveBeenCalledTimes(2);
    expect(viewer.current.setBitVisible).toHaveBeenLastCalledWith(false);
});

test('finishes, restarts, and replaces data without stale animation', () => {
    const { result, unmount } = renderHook(() => usePreviewPlayback(viewer));
    act(() => {
        result.current.load(segments());
        result.current.setSpeed(500);
    });
    act(() => result.current.play());
    step(0);
    step(1000);
    expect(result.current.line).toBe(101);
    expect(result.current.playing).toBe(false);
    act(() => result.current.play());
    expect(result.current.line).toBe(0);
    const stale = [...frames.values()][0];
    act(() => result.current.load(segments()));
    act(() => stale(3000));
    expect(result.current.line).toBe(0);
    expect(result.current.playing).toBe(false);
    act(() => result.current.play());
    unmount();
    expect(frames.size).toBe(0);
});

test('fractional progress accumulates and backgrounding pauses', () => {
    const { result } = renderHook(() => usePreviewPlayback(viewer));
    act(() => {
        result.current.load(segments());
        result.current.setSpeed(25);
    });
    act(() => result.current.play());
    for (let time = 0; time <= 400; time += 10) step(time);
    expect(result.current.line).toBe(10);
    act(() => result.current.setSpeed(-1));
    expect(result.current.speed).toBe(25);
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.playing).toBe(false);
    expect(frames.size).toBe(0);
    hidden.mockRestore();
});

test('timed playback follows acceleration with speed multipliers, scrubbing and reset', async () => {
    const code = 'G1 X100 F600' + '\n'.repeat(100);
    const { playback: plan } = await estimateProgramTime(
        code,
        {
            maxSpeed: [6000, 6000, 6000],
            acceleration: [100, 100, 100],
            start: [0, 0, 0],
            junctionDeviation: 0.01,
        },
        'P-seconds',
        () => {},
        true,
    );
    const { result } = renderHook(() => usePreviewPlayback(viewer, plan));
    act(() => result.current.load(segments()));
    expect(result.current.timed).toBe(true);
    expect(result.current.speed).toBe(1);
    act(() => result.current.play());
    step(0);
    step(50);
    expect(result.current.position).toBeCloseTo(0.05, 8);
    expect(viewer.current.setBitPosition).toHaveBeenLastCalledWith(
        { x: 0.125, y: 0, z: 0 },
        { immediate: true },
    );
    act(() => result.current.setSpeed(2));
    step(550);
    expect(result.current.position).toBeCloseTo(1.05, 8);
    act(() => result.current.seek(5.05));
    expect(result.current.playing).toBe(false);
    expect(viewer.current.setBitPosition).toHaveBeenLastCalledWith(
        { x: 50, y: 0, z: 0 },
        { immediate: true },
    );
    act(() => result.current.reset());
    expect(result.current.position).toBe(0);
    expect(viewer.current.setBitPosition).toHaveBeenLastCalledWith(
        { x: 0, y: 0, z: 0 },
        { immediate: true },
    );
    act(() => result.current.seek(plan.seconds));
    expect(result.current.line).toBe(101);
});

test('removing/replacing timing cancels old frames and restores line mode without parsing', async () => {
    const { playback: plan } = await estimateProgramTime(
        'G1 X100 F600' + '\n'.repeat(100),
        {
            maxSpeed: [6000, 6000, 6000],
            acceleration: [100, 100, 100],
            start: [0, 0, 0],
            junctionDeviation: 0.01,
        },
        'P-seconds',
        () => {},
        true,
    );
    const { result, rerender } = renderHook(
        ({ timing }) => usePreviewPlayback(viewer, timing),
        {
            initialProps: { timing: plan },
        },
    );
    act(() => result.current.load(segments()));
    act(() => result.current.play());
    const stale = [...frames.values()][0];
    rerender({ timing: undefined });
    act(() => stale(5000));
    expect(result.current.timed).toBe(false);
    expect(result.current.speed).toBe(100);
    expect(result.current.position).toBe(0);
    expect(result.current.playing).toBe(false);
    expect(frames.size).toBe(0);
    rerender({ timing: plan });
    expect(result.current.timed).toBe(true);
    act(() => result.current.play());
    step(0);
    step(11000);
    expect(result.current.playing).toBe(false);
    expect(result.current.position).toBe(plan.seconds);
    expect(result.current.line).toBe(101);
});
