import { jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ImportResult } from '../lib/import';
const sample: ImportResult = {
    fileName: 'curve.svg',
    entityCount: 1,
    layers: [],
    loops: [
        {
            id: 'original',
            points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ],
        },
    ],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
    unitScaleToMm: 25.4 / 96,
    unitSource: 'svg-pixels',
};
const load = jest.fn(async (_file: File, _scale?: number) => sample);
const scale = jest.fn((r: ImportResult, _factor: number) => r);
await jest.unstable_mockModule('../lib/import', () => ({
    importVectorFile: load,
    scaleImportResult: scale,
}));
const { useVectorImport } = await import('./useVectorImport');
const options = () => ({
    setLoops: jest.fn(),
    setBitmaps: jest.fn(),
    setSelected: jest.fn(),
    setStack: jest.fn(),
    setFileName: jest.fn(),
    setStatus: jest.fn(),
    setBounds: jest.fn(),
    pushHistory: jest.fn(),
    newLoopId: () => 'new',
    onFitView: jest.fn(),
});
beforeEach(() => {
    load.mockReset().mockImplementation(async () => sample);
    scale.mockClear();
});
test('chosen SVG units trigger refinement at that physical scale before committing', async () => {
    const opts = options(),
        file = new File(['svg'], 'curve.svg');
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () => result.current.importVector(file));
    expect(opts.setLoops).not.toHaveBeenCalled();
    await act(async () => result.current.resolveUnitImport(25.4));
    expect(load).toHaveBeenLastCalledWith(file, 25.4);
    expect(scale).toHaveBeenLastCalledWith(sample, 25.4);
    expect(opts.setLoops).toHaveBeenCalledTimes(1);
    expect(result.current.unitImportChoice).toBeNull();
});
test('cancelling an outstanding SVG refinement cannot commit its late result', async () => {
    const opts = options(),
        file = new File(['svg'], 'curve.svg');
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () => result.current.importVector(file));
    let finish!: (value: ImportResult) => void;
    load.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    let pending!: Promise<void>;
    act(() => {
        pending = result.current.resolveUnitImport(25.4);
    });
    act(() => result.current.cancelUnitImport());
    await act(async () => {
        finish({
            ...sample,
            bitmaps: [{ id: 'late', x: 1, y: 2, w: 3, h: 4, dataUrl: 'png' }],
        });
        await pending;
    });
    expect(opts.setLoops).not.toHaveBeenCalled();
    expect(opts.pushHistory).not.toHaveBeenCalled();
    expect(opts.setBitmaps).not.toHaveBeenCalled();
});
test('refinement failure retains the unit choice and reports the error without replacing artwork', async () => {
    const opts = options(),
        file = new File(['svg'], 'curve.svg');
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () => result.current.importVector(file));
    load.mockRejectedValueOnce(
        new Error('Curve coordinates exceed tolerance precision.'),
    );
    await act(async () => result.current.resolveUnitImport(25.4));
    expect(opts.setLoops).not.toHaveBeenCalled();
    expect(result.current.unitImportChoice).not.toBeNull();
    expect(opts.setStatus).toHaveBeenLastCalledWith(
        'Curve coordinates exceed tolerance precision.',
    );
});

test('mixed artwork and decoded bitmaps commit in one history step', async () => {
    const opts = options(),
        bitmap = { id: 'image', x: 2, y: 3, w: 4, h: 5, dataUrl: 'png' };
    const mixed = {
        ...sample,
        bitmaps: [bitmap],
        unitSource: 'svg-physical-size' as const,
        unitScaleToMm: 1,
    };
    load.mockResolvedValueOnce(mixed);
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () =>
        result.current.importVector(new File(['svg'], 'mixed.svg')),
    );
    expect(opts.setBitmaps).toHaveBeenCalledWith([bitmap]);
    expect(opts.setLoops).toHaveBeenCalledTimes(1);
    expect(opts.pushHistory).toHaveBeenCalledTimes(1);
});
test('vector-only replacements remove bitmap assets from the previous drawing', async () => {
    const opts = options();
    load.mockResolvedValueOnce({
        ...sample,
        unitSource: 'svg-physical-size',
        unitScaleToMm: 1,
    });
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () =>
        result.current.importVector(new File(['svg'], 'shapes.svg')),
    );
    expect(opts.setBitmaps).toHaveBeenCalledWith([]);
});
test('failed mixed-image decoding leaves all document state unmodified', async () => {
    const opts = options();
    load.mockRejectedValueOnce(
        new Error('Could not decode an embedded SVG image.'),
    );
    const { result } = renderHook(() => useVectorImport(opts));
    await act(async () =>
        result.current.importVector(new File(['svg'], 'bad.svg')),
    );
    expect(opts.setBitmaps).not.toHaveBeenCalled();
    expect(opts.setLoops).not.toHaveBeenCalled();
    expect(opts.pushHistory).not.toHaveBeenCalled();
});
