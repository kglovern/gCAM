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
const { combineRotaryPaths } = await import('./engine/job');
function requestFixture(): MeshPlanRequest {
    return {
        entries: [],
        samples: [],
        pommels: [],
        mesh: { key: 'mesh' } as MeshPlanRequest['mesh'],
        stock: { length: 145, diameter: 37, grip: 19, ext: false },
        draft: {
            id: 'draft',
            operation: 'finish',
            tool: {
                type: 'ball',
                dia: 3.175,
                feed: 500,
                plunge: 100,
                spindle: 16000,
                slotNum: 3,
            },
            ops: {
                face: false,
                rough: false,
                finish: true,
                allow: 0.8,
                roughStep: 2,
                raster: 270,
                groove: { on: false, x: 55, w: 3 },
                part: { on: false, x: 80 },
            },
        },
    };
}
beforeEach(() => {
    workers.length = 0;
    jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test('mesh planning debounces, cancels superseded workers and hides stale results', () => {
    jest.useFakeTimers();
    const a = requestFixture(),
        b = requestFixture();
    const { result, rerender, unmount } = renderHook(
        ({ request }) => useMeshPlan(request),
        { initialProps: { request: a } },
    );
    act(() => jest.advanceTimersByTime(400));
    expect(workers).toHaveLength(1);
    expect(result.current).toBeNull();
    act(() => workers[0].onmessage({ data: { progress: 42 } }));
    expect(result.current?.progress).toBe(42);
    expect(result.current?.result).toBeUndefined();
    expect(workers[0].terminate).not.toHaveBeenCalled();
    act(() =>
        workers[0].onmessage({
            data: {
                job: { paths: [], moves: [], flags: [] },
                draft: { entry: a.draft, moves: [1], flags: [], compR: 0 },
            },
        }),
    );
    expect(result.current?.request).toBe(a);
    rerender({ request: b });
    expect(result.current).toBeNull();
    expect(workers[0].terminate).toHaveBeenCalled();
    act(() => workers[0].onmessage({ data: { job: { moves: [99] } } }));
    expect(result.current).toBeNull();
    act(() => workers[0].onmessage({ data: { progress: 99 } }));
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

test('saving, reopening, reordering and deleting unchanged paths reuse completed preview moves', () => {
    const request = requestFixture();
    const saved = {
        ...request.draft,
        id: 'saved',
        operation: 'rough' as const,
    };
    request.entries = [saved];
    const rough = {
        entry: saved,
        moves: [{ op: 'rough', x: 1 }],
        flags: [],
        compR: 0,
    };
    const finish = {
        entry: request.draft,
        moves: [{ op: 'finish', x: 2 }],
        flags: [{ level: 'w', msg: 'Cutter warning' }],
        compR: 0,
    };
    const { result, rerender, unmount } = renderHook(
        ({ request }) => useMeshPlan(request),
        { initialProps: { request } },
    );
    act(() => jest.advanceTimersByTime(400));
    act(() =>
        workers[0].onmessage({
            data: { job: combineRotaryPaths([rough]), draft: finish },
        }),
    );
    const entry = { ...request.draft, id: 'new-saved' };
    rerender({ request: { ...request, entries: [saved, entry] } });
    expect(result.current?.result?.job.paths[1].moves).toBe(finish.moves);
    expect(result.current?.result?.job.paths[1].entry.id).toBe('new-saved');
    expect(result.current?.result?.job.flags).toEqual([
        { level: 'w', msg: 'Finishing: Cutter warning' },
    ]);
    rerender({
        request: {
            ...request,
            entries: [entry, saved],
            draft: {
                ...entry,
                tool: { ...entry.tool, manualCuttingParams: true },
            },
        },
    });
    expect(result.current?.result?.job.paths.map((p) => p.entry.id)).toEqual([
        'new-saved',
        'saved',
    ]);
    expect(result.current?.result?.draft.moves).toBe(finish.moves);
    rerender({ request: { ...request, entries: [entry] } });
    expect(result.current?.result?.job.moves).toEqual(finish.moves);
    act(() => jest.advanceTimersByTime(1000));
    expect(workers).toHaveLength(1);
    unmount();
});

test.each([
    'mesh',
    'stock',
    'pommels',
    'samples',
    'tool',
    'operation',
    'settings',
])(
    'changing %s invalidates cached geometry before another worker starts',
    (field) => {
        const request = requestFixture();
        const finish = {
            entry: request.draft,
            moves: [{ op: 'finish', x: 2 }],
            flags: [],
            compR: 0,
        };
        const { result, rerender, unmount } = renderHook(
            ({ request }) => useMeshPlan(request),
            { initialProps: { request } },
        );
        act(() => jest.advanceTimersByTime(400));
        act(() =>
            workers[0].onmessage({
                data: { job: combineRotaryPaths([]), draft: finish },
            }),
        );
        let changed = { ...request };
        if (field === 'mode') changed.mode = 'profile';
        if (field === 'mesh') changed.mesh = { ...request.mesh! };
        if (field === 'stock')
            changed.stock = { ...request.stock, diameter: 40 };
        if (field === 'pommels') changed.pommels = [{ x0: 20, x1: 30, w: 10 }];
        if (field === 'samples') changed.samples = [...request.samples];
        if (field === 'tool')
            changed.draft = {
                ...request.draft,
                tool: { ...request.draft.tool, feed: 600 },
            };
        if (field === 'operation')
            changed.draft = { ...request.draft, operation: 'rough' };
        if (field === 'settings')
            changed.draft = {
                ...request.draft,
                ops: { ...request.draft.ops, allow: 1 },
            };
        rerender({ request: changed });
        expect(result.current).toBeNull();
        act(() => jest.advanceTimersByTime(400));
        expect(workers).toHaveLength(2);
        unmount();
    },
);

test('worker geometry errors remain visible and cannot expose a stale result', () => {
    const request = requestFixture();
    const { result, unmount } = renderHook(() => useMeshPlan(request));
    act(() => jest.advanceTimersByTime(400));
    act(() =>
        workers[0].onmessage({
            data: { error: 'Profile curve is too complex.' },
        }),
    );
    expect(result.current?.error).toBe('Profile curve is too complex.');
    expect(result.current?.result).toBeUndefined();
    expect(workers[0].terminate).toHaveBeenCalled();
    unmount();
});
