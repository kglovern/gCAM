import { jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { resolveLinkedImageMask } from '../lib/image-mask';
import type { ToolpathStackEntry } from './useToolpathStack';
const exporter = jest.fn((_toolpaths: Record<string, unknown>[]) => ({
    gcode: 'CURRENT',
    gcodeError: '',
    gcodeBusy: false,
}));
jest.unstable_mockModule('../gcode/useProgramExport', () => ({
    useProgramExport: exporter,
}));
const { useToolpathPresentation } = await import('./useToolpathPresentation');
const source = {
    id: 'outline',
    bitmapId: 'image',
    points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
    ],
};
const mask = {
    id: 'mask',
    points: [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
        { x: 20, y: 20 },
    ],
};
const bitmap = {
    id: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    dataUrl: 'source',
    maskSourceIds: ['mask'],
};
const entry = {
    id: 'job',
    label: 'Image',
    args: {
        operation: 'laser-raster',
        loops: [source],
        laserOptions: {
            maskSourceIds: ['mask'],
            imageMask: resolveLinkedImageMask(bitmap, [source, mask]),
        },
    },
    preview: [
        {
            points: [
                { x: 20, y: 20 },
                { x: 80, y: 20 },
            ],
        },
    ],
    toolpath: { operation: 'laser-raster' },
} as unknown as ToolpathStackEntry;
test('a stale linked mask cannot leave old program text or preview available', () => {
    const { result, rerender } = renderHook(
        ({ changed }) =>
            useToolpathPresentation({
                stack: [entry],
                editingId: null,
                fileName: 'job',
                emitArcs: false,
                units: 'metric',
                maskBitmaps: [bitmap],
                maskLoops: [
                    source,
                    changed
                        ? {
                              ...mask,
                              points: mask.points.map((p) => ({
                                  x: p.x + 1,
                                  y: p.y,
                              })),
                          }
                        : mask,
                ],
            }),
        { initialProps: { changed: false } },
    );
    expect(result.current.gcode).toBe('CURRENT');
    expect(result.current.preview).toHaveLength(1);
    rerender({ changed: true });
    expect(result.current.gcode).toBe('');
    expect(result.current.gcodeError).toMatch(/Regenerate/);
    expect(result.current.gcodeBusy).toBe(false);
    expect(result.current.preview).toEqual([]);
    expect(result.current.previewToolpaths).toEqual([]);
    expect(exporter.mock.calls[exporter.mock.calls.length - 1][0]).toEqual([]);
    rerender({ changed: false });
    expect(result.current.gcode).toBe('CURRENT');
    expect(result.current.gcodeError).toBe('');
});
