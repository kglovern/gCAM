import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { DepthPreviewImage } from '../lib/cut-depth-preview';
import type { ToolpathStackEntry } from './useToolpathStack';
const pending: {
    resolve: (v: DepthPreviewImage) => void;
    reject: (e: Error) => void;
    cancel: ReturnType<typeof jest.fn>;
}[] = [];
await jest.unstable_mockModule('../engine/cam-worker-client', () => ({
    cutDepthPreviewInWorker: () => {
        const cancel = jest.fn();
        return {
            cancel,
            promise: new Promise<DepthPreviewImage>((resolve, reject) =>
                pending.push({ resolve, reject, cancel }),
            ),
        };
    },
}));
const { useCutDepthPreview } = await import('./useCutDepthPreview');
const WorkerBefore = globalThis.Worker;
beforeAll(() => {
    globalThis.Worker = class {} as unknown as typeof Worker;
});
afterAll(() => {
    globalThis.Worker = WorkerBefore;
});
beforeEach(() => {
    pending.length = 0;
});
const stack = [
    { id: 'cut', args: { operation: 'engrave' }, toolpath: {}, preview: [] },
] as unknown as ToolpathStackEntry[];
const image = { width: 1, height: 1 } as DepthPreviewImage;
test('changed stock, edit mode and disabled jobs cancel obsolete previews and reject late results', async () => {
    const { result, rerender, unmount } = renderHook(
        ({
            entries,
            stock,
            edit,
        }: {
            entries: ToolpathStackEntry[];
            stock: number;
            edit: string | null;
        }) => useCutDepthPreview(entries, edit, stock),
        {
            initialProps: {
                entries: stack,
                stock: 18,
                edit: null as string | null,
            },
        },
    );
    expect(result.current.pending).toBe(true);
    rerender({ entries: stack, stock: 12, edit: null });
    expect(pending[0].cancel).toHaveBeenCalledTimes(1);
    await act(async () => pending[0].resolve(image));
    expect(result.current.image).toBeUndefined();
    await act(async () => pending[1].resolve(image));
    expect(result.current.image).toBe(image);
    rerender({ entries: stack, stock: 12, edit: 'cut' });
    expect(result.current.image).toBeUndefined();
    rerender({
        entries: [{ ...stack[0], outputEnabled: false }],
        stock: 12,
        edit: null,
    });
    expect(result.current.pending).toBe(false);
    unmount();
});
test('a preview failure leaves an error without a stale image', async () => {
    const { result } = renderHook(() => useCutDepthPreview(stack, null, 18));
    await act(async () => pending[0].reject(new Error('Detail limit')));
    expect(result.current.image).toBeUndefined();
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe('Detail limit');
});
