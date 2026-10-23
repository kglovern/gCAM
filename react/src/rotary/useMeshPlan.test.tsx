import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { MeshPlanRequest } from './useMeshPlan';
const workers: any[] = [];
class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    terminate = jest.fn();
    postMessage = jest.fn();
    constructor() {
        workers.push(this);
    }
}
jest.unstable_mockModule('./meshWorker', () => ({
    createMeshWorker: () => new FakeWorker(),
}));
const { useMeshPlan } = await import('./useMeshPlan');

test('mesh planning debounces, cancels superseded workers and hides stale results', () => {
    jest.useFakeTimers();
    const a = {} as MeshPlanRequest,
        b = {} as MeshPlanRequest;
    const { result, rerender, unmount } = renderHook(
        ({ request }) => useMeshPlan(request),
        { initialProps: { request: a } },
    );
    act(() => jest.advanceTimersByTime(400));
    expect(workers).toHaveLength(1);
    expect(result.current).toBeNull();
    act(() =>
        workers[0].onmessage({
            data: { job: { moves: [1] }, draft: { moves: [1] } },
        }),
    );
    expect(result.current?.request).toBe(a);
    rerender({ request: b });
    expect(result.current).toBeNull();
    expect(workers[0].terminate).toHaveBeenCalled();
    act(() => workers[0].onmessage({ data: { job: { moves: [99] } } }));
    expect(result.current).toBeNull();
    act(() => jest.advanceTimersByTime(400));
    act(() => jest.advanceTimersByTime(90000));
    expect(result.current?.error).toMatch(/90 seconds/);
    act(() => workers[1].onmessage({ data: { job: { moves: [999] } } }));
    expect(result.current?.error).toMatch(/90 seconds/);
    expect(workers[1].terminate).toHaveBeenCalled();
    unmount();
    jest.useRealTimers();
});
