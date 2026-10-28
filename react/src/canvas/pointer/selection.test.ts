import { finishSelection, updateSelectionHover } from './selection';
import { jest } from '@jest/globals';
import type { CanvasPointerControllerProps } from './types';

test.each([
    [false, ['vector-1'], ['vector-2']],
    [false, ['vector-1', 'vector-2'], ['vector-2']],
    [true, ['vector-1'], ['vector-1', 'vector-2']],
    [true, ['vector-1', 'vector-2'], ['vector-1']],
])(
    'click with ctrl=%s resolves selection %j to %j',
    (ctrlKey, selected, expected) => {
        const onSelect = jest.fn();
        finishSelection(
            {
                button: 0,
                clientX: 55,
                clientY: 45,
                ctrlKey,
                shiftKey: false,
                metaKey: false,
            } as React.MouseEvent<HTMLCanvasElement>,
            selectionDeps(selected as string[], onSelect),
            { x: 55, y: 45 },
            null,
        );
        expect(onSelect).toHaveBeenCalledWith(expected);
    },
);

function selectionDeps(selected: string[], onSelect: (ids: string[]) => void) {
    return {
        selectedGuideRef: { current: null },
        canvasRef: {
            current: {
                getBoundingClientRect: () => ({ left: 0, top: 0 }),
            },
        },
        cameraRef: { current: { tx: 0, ty: 100, scale: 1 } },
        viewRef: {
            current: {
                loops: [
                    {
                        id: 'vector-1',
                        points: [
                            { x: 10, y: 10 },
                            { x: 20, y: 20 },
                        ],
                    },
                    {
                        id: 'model-1',
                        bitmapId: 'stl-1',
                        points: [
                            { x: 30, y: 30 },
                            { x: 40, y: 40 },
                        ],
                    },
                    {
                        id: 'vector-2',
                        points: [
                            { x: 50, y: 50 },
                            { x: 60, y: 60 },
                        ],
                    },
                ],
                hidden: [],
                selected,
                bitmaps: [],
            },
        },
        onSelect,
        forceTick: jest.fn(),
    } as unknown as CanvasPointerControllerProps;
}

test('marquee selects vectors but excludes 3D bitmap geometry', () => {
    const onSelect = jest.fn();
    finishSelection(
        { shiftKey: false } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps([], onSelect),
        null,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(onSelect).toHaveBeenCalledWith(['vector-1', 'vector-2']);
});

test('shift-marquee drops previously selected 3D models and keeps vector selection', () => {
    const onSelect = jest.fn();
    finishSelection(
        { shiftKey: true } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps(['model-1', 'vector-1'], onSelect),
        null,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(onSelect).toHaveBeenCalledWith(['vector-1', 'vector-2']);
});

test('control-clicking empty space preserves the current selection', () => {
    const onSelect = jest.fn();
    finishSelection(
        {
            button: 0,
            clientX: 100,
            clientY: 100,
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
        } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps(['vector-1'], onSelect),
        { x: 100, y: 100 },
        null,
    );
    expect(onSelect).not.toHaveBeenCalled();
});

test('control-marquee adds to the current selection', () => {
    const onSelect = jest.fn();
    finishSelection(
        {
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
        } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps(['vector-1'], onSelect),
        null,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(onSelect).toHaveBeenCalledWith(['vector-1', 'vector-2']);
});

test('touch multi-select toggles a vector without any keyboard modifier', () => {
    const onSelect = jest.fn();
    const deps = selectionDeps(['vector-1'], onSelect);
    deps.additiveSelection = true;
    const event = {
        button: 0,
        clientX: 55,
        clientY: 45,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
    } as React.MouseEvent<HTMLCanvasElement>;
    finishSelection(event, deps, { x: 55, y: 45 }, null);
    expect(onSelect).toHaveBeenLastCalledWith(['vector-1', 'vector-2']);
    deps.viewRef.current.selected = ['vector-1', 'vector-2'];
    finishSelection(event, deps, { x: 55, y: 45 }, null);
    expect(onSelect).toHaveBeenLastCalledWith(['vector-1']);
});

test('Transform shares selection hover and clears it while dragging or over hidden geometry', () => {
    const deps = selectionDeps([], jest.fn());
    deps.activeTool = 'select';
    deps.viewRef.current.transformMode = 'transform';
    deps.guideHoverRef = { current: null };
    deps.loopHoverRef = { current: null };
    const event = {
        clientX: 55,
        clientY: 45,
        buttons: 0,
    } as React.MouseEvent<HTMLCanvasElement>;
    updateSelectionHover(event, deps);
    expect(deps.loopHoverRef.current?.loopId).toBe('vector-2');
    updateSelectionHover({ ...event, buttons: 1 }, deps);
    expect(deps.loopHoverRef.current).toBeNull();
    deps.viewRef.current.hidden = ['vector-2'];
    updateSelectionHover(event, deps);
    expect(deps.loopHoverRef.current).toBeNull();
});
