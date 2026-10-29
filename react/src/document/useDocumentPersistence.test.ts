import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, jest, test } from '@jest/globals';
import { ProjectAutosaveStore } from '../lib/autosave';
import { DEFAULT_JOB_STOCK } from '../job/stock';
import { useDocumentPersistence } from './useDocumentPersistence';
afterEach(() => {
    jest.restoreAllMocks();
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
