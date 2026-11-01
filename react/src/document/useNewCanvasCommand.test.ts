import { jest } from '@jest/globals';
import { useNewCanvasCommand } from './useNewCanvasCommand';
import { DEFAULT_JOB_STOCK } from '../job/stock';

test('new projects restore machine-sized default stock and front-left origin', () => {
    const setStock = jest.fn();
    const cancelPendingImport = jest.fn();
    const defaults = { ...DEFAULT_JOB_STOCK, widthMm: 810, heightMm: 855 };
    const options = new Proxy(
        {
            loops: [],
            layers: [],
            stack: [],
            bitmaps: [],
            guides: [],
            defaultStock: defaults,
            cancelPendingImport,
            setStock,
        },
        {
            get: (target, key) =>
                key in target ? target[key as keyof typeof target] : jest.fn(),
        },
    );
    const { handleNewCanvas } = useNewCanvasCommand(
        options as unknown as Parameters<typeof useNewCanvasCommand>[0],
    );
    handleNewCanvas();
    expect(setStock).toHaveBeenCalledWith(defaults);
    expect(setStock.mock.calls[0][0]).not.toBe(defaults);
    expect(defaults.origin).toBe('front-left');
    expect(cancelPendingImport).toHaveBeenCalledTimes(1);
});

test('declining New Project preserves both the document and its pending import', () => {
    const cancelPendingImport = jest.fn(),
        setLoops = jest.fn();
    const options = new Proxy(
        {
            loops: [{}],
            layers: [],
            stack: [],
            bitmaps: [],
            guides: [],
            cancelPendingImport,
            setLoops,
        },
        {
            get: (target, key) =>
                key in target ? target[key as keyof typeof target] : jest.fn(),
        },
    );
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
        useNewCanvasCommand(
            options as unknown as Parameters<typeof useNewCanvasCommand>[0],
        ).handleNewCanvas();
        expect(cancelPendingImport).not.toHaveBeenCalled();
        expect(setLoops).not.toHaveBeenCalled();
    } finally {
        confirm.mockRestore();
    }
});
