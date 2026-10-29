import { renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useFileLoading } from './useFileLoading';
test('normal toolpath model files stay with the surface importer', async () => {
    const surface = jest
        .fn<(file: File) => Promise<void>>()
        .mockResolvedValue(undefined);
    const vector = jest
        .fn<(file: File) => Promise<void>>()
        .mockResolvedValue(undefined);
    const bitmap = jest
        .fn<(file: File) => Promise<void>>()
        .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
        useFileLoading({
            isBitmapFile: () => false,
            loadBitmap: bitmap,
            isSurfaceModelFile: (file) => /\.(stl|obj)$/.test(file.name),
            loadSurfaceModel: surface,
            importVector: vector,
            setStatus: jest.fn(),
            setLoadingSample: jest.fn(),
        }),
    );
    for (const name of ['part.stl', 'part.obj']) {
        const file = new File(['model'], name);
        await result.current.handleFiles([file]);
        expect(surface).toHaveBeenCalledWith(file);
    }
    expect(vector).not.toHaveBeenCalled();
    expect(bitmap).not.toHaveBeenCalled();
});
