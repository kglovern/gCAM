import { renderHook } from '@testing-library/react';
import { useToolpathPresentation } from './useToolpathPresentation';
import type { ToolpathStackEntry } from './useToolpathStack';

test('an edited laser preview replaces the committed geometry; cancel restores it', () => {
    const make = (
        id: string,
        operation: 'laser-raster' | 'profile-outside',
    ): ToolpathStackEntry => ({
        id,
        label: id,
        args: { operation, loops: [], cutDepth: 1, toolDiameter: 1 },
        preview: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
            },
        ],
        toolpath: {},
    });
    const stack = [
        make('image', 'laser-raster'),
        make('mill', 'profile-outside'),
    ];
    const { result, rerender } = renderHook(
        ({ editingId }: { editingId: string | null }) =>
            useToolpathPresentation({
                stack,
                editingId,
                fileName: 'job',
                emitArcs: false,
                units: 'metric',
            }),
        {
            initialProps: { editingId: 'image' } as {
                editingId: string | null;
            },
        },
    );
    expect(result.current.preview.map((p) => p.entryId)).toEqual(['mill']);
    rerender({ editingId: null });
    expect(result.current.preview.map((p) => p.entryId)).toEqual([
        'image',
        'mill',
    ]);
    rerender({ editingId: 'mill' });
    expect(result.current.preview.map((p) => p.entryId)).toEqual([
        'image',
        'mill',
    ]);
});

test('output-disabled operations stay editable but leave both previews and exported G-code', () => {
    const entry: ToolpathStackEntry = {
        id: 'off',
        label: 'Off',
        outputEnabled: false,
        args: {
            operation: 'laser-cut',
            loops: [],
            cutDepth: 1,
            toolDiameter: 1,
        },
        preview: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
        ],
        toolpath: { operation: 'laser-cut', label: 'Off' },
    };
    const { result } = renderHook(() =>
        useToolpathPresentation({
            stack: [entry],
            editingId: 'off',
            fileName: 'job',
            emitArcs: false,
            units: 'metric',
        }),
    );
    expect(result.current.editingEntry).toBe(entry);
    expect(result.current.preview).toEqual([]);
    expect(result.current.previewToolpaths).toEqual([]);
    expect(result.current.gcode).toBe('');
    expect(result.current.gcodeError).toBe('');
});
