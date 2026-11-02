import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, jest, test } from '@jest/globals';
import { ProjectAutosaveStore } from '../lib/autosave';
import { DEFAULT_JOB_STOCK } from '../job/stock';
import { useDocumentPersistence } from './useDocumentPersistence';
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});
test('recovers guide-only projects through the normal saved guide list', async () => {
    const guides = [
        {
            id: 'ruler-guide',
            point: { x: 0, y: 40 },
            direction: { x: 1, y: 0 },
        },
    ];
    jest.spyOn(ProjectAutosaveStore.prototype, 'load').mockResolvedValue({
        snapshot: {
            loops: [],
            selected: [],
            hidden: [],
            stack: [],
            bitmaps: [],
            guides,
            fileName: 'guides',
            stock: DEFAULT_JOB_STOCK,
        },
        savedAt: 1,
    });
    const restore = jest.fn();
    renderHook(() =>
        useDocumentPersistence({
            loops: [],
            selected: [],
            hidden: [],
            stack: [],
            bitmaps: [],
            guides: [],
            stock: DEFAULT_JOB_STOCK,
            fileName: '',
            onFitView: jest.fn(),
            restore,
            setBitmaps: jest.fn(),
            setFileName: jest.fn(),
            setStock: jest.fn(),
            setStatus: jest.fn(),
        }),
    );
    await waitFor(() =>
        expect(restore).toHaveBeenCalledWith(
            expect.objectContaining({ guides }),
        ),
    );
});

function documentOptions(): Parameters<typeof useDocumentPersistence>[0] {
    return {
        loops: [],
        selected: [],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        stock: DEFAULT_JOB_STOCK,
        fileName: '',
        onFitView: jest.fn(),
        restore: jest.fn(),
        setBitmaps: jest.fn(),
        setFileName: jest.fn(),
        setStock: jest.fn(),
        setStatus: jest.fn(),
    };
}
test('late recovery cannot replace a new import and the latest document is saved after recovery settles', async () => {
    jest.useFakeTimers();
    let resolve!: (
        value: Awaited<ReturnType<ProjectAutosaveStore['load']>>,
    ) => void;
    jest.spyOn(ProjectAutosaveStore.prototype, 'load').mockImplementation(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const save = jest
        .spyOn(ProjectAutosaveStore.prototype, 'save')
        .mockResolvedValue();
    const initial = documentOptions();
    const { rerender } = renderHook((props) => useDocumentPersistence(props), {
        initialProps: initial,
    });
    const imported = {
        ...initial,
        fileName: 'Fresh laser job',
        guides: [
            {
                id: 'new-guide',
                point: { x: 10, y: 0 },
                direction: { x: 0, y: 1 },
            },
        ],
    };
    rerender(imported);
    await act(async () =>
        resolve({
            snapshot: {
                ...initial,
                fileName: 'Old recovery',
                guides: [
                    {
                        id: 'old-guide',
                        point: { x: 0, y: 20 },
                        direction: { x: 1, y: 0 },
                    },
                ],
            },
            savedAt: 1,
        }),
    );
    expect(initial.restore).not.toHaveBeenCalled();
    expect(initial.setFileName).not.toHaveBeenCalled();
    expect(initial.setStatus).not.toHaveBeenCalled();
    await act(async () => {
        jest.advanceTimersByTime(600);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            fileName: 'Fresh laser job',
            guides: imported.guides,
        }),
    );
});
test('denied recovery preserves the old save until a real document edit', async () => {
    jest.useFakeTimers();
    jest.spyOn(ProjectAutosaveStore.prototype, 'load').mockRejectedValue(
        new Error('IndexedDB denied'),
    );
    const save = jest
        .spyOn(ProjectAutosaveStore.prototype, 'save')
        .mockResolvedValue();
    const initial = documentOptions();
    const { rerender } = renderHook((props) => useDocumentPersistence(props), {
        initialProps: initial,
    });
    await act(async () => {});
    await act(async () => {
        jest.advanceTimersByTime(600);
    });
    expect(save).not.toHaveBeenCalled();
    rerender({ ...initial, fileName: 'New drawing' });
    await act(async () => {
        jest.advanceTimersByTime(600);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'New drawing' }),
    );
});
test('unmount cancels a pending recovery without restoring or scheduling autosave', async () => {
    jest.useFakeTimers();
    let resolve!: (
        value: Awaited<ReturnType<ProjectAutosaveStore['load']>>,
    ) => void;
    jest.spyOn(ProjectAutosaveStore.prototype, 'load').mockImplementation(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const save = jest
        .spyOn(ProjectAutosaveStore.prototype, 'save')
        .mockResolvedValue();
    const initial = documentOptions();
    const { unmount } = renderHook(() => useDocumentPersistence(initial));
    unmount();
    await act(async () =>
        resolve({
            snapshot: {
                ...initial,
                guides: [
                    {
                        id: 'old',
                        point: { x: 0, y: 20 },
                        direction: { x: 1, y: 0 },
                    },
                ],
            },
            savedAt: 1,
        }),
    );
    await act(async () => {
        jest.runAllTimers();
    });
    expect(initial.restore).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
});
