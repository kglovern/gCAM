import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
const pending: {
    resolve: (s: string) => void;
    reject: (e: Error) => void;
    cancel: ReturnType<typeof jest.fn>;
}[] = [];
await jest.unstable_mockModule('../engine/cam-worker-client', () => ({
    exportProgramInWorker: () => {
        const cancel = jest.fn();
        const promise = new Promise<string>((resolve, reject) =>
            pending.push({ resolve, reject, cancel }),
        );
        return { promise, cancel };
    },
}));
const { useProgramExport } = await import('./useProgramExport');
const originalWorker = globalThis.Worker;
beforeAll(() => {
    globalThis.Worker = class {} as unknown as typeof Worker;
});
afterAll(() => {
    globalThis.Worker = originalWorker;
});
beforeEach(() => {
    pending.length = 0;
});
const paths = [{ operation: 'laser-cut', laserPaths: [], passDepths: [0] }];
test('pending export never exposes a stale program and late results cannot replace the latest request', async () => {
    const { result, rerender } = renderHook(
        ({ name }) => useProgramExport(paths, name, false, 'metric'),
        { initialProps: { name: 'first' } },
    );
    expect(result.current.gcodeBusy).toBe(true);
    rerender({ name: 'second' });
    expect(pending[0].cancel).toHaveBeenCalledTimes(1);
    await act(async () => pending[1].resolve('second program'));
    expect(result.current.gcode).toBe('second program');
    await act(async () => pending[0].resolve('obsolete program'));
    expect(result.current.gcode).toBe('second program');
    rerender({ name: 'third' });
    expect(result.current.gcode).toBe('');
    expect(result.current.gcodeBusy).toBe(true);
    await act(async () => pending[2].reject(new Error('Invalid power')));
    expect(result.current.gcode).toBe('');
    expect(result.current.gcodeError).toBe('Invalid power');
    expect(result.current.gcodeBusy).toBe(false);
});
test('disabling every operation immediately removes output even when the old worker finishes', async () => {
    const { result, rerender } = renderHook(
        ({ enabled }) =>
            useProgramExport(enabled ? paths : [], 'job', false, 'metric'),
        { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    await act(async () => pending[0].resolve('obsolete program'));
    expect(result.current.gcode).toBe('');
    expect(result.current.gcodeBusy).toBe(false);
});
