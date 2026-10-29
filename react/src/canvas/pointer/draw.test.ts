import { jest } from '@jest/globals';
import { finishDraw, updateDrawDraft } from './draw';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';
import type { DrawTool } from '../../draw/geometry';
function setup(tool: DrawTool) {
    const deps = {
        canvasRef: {
            current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
        },
        cameraRef: { current: { scale: 1, tx: 0, ty: 100 } },
        viewRef: {
            current: {
                drawTool: tool,
                loops: [],
                hidden: [],
                guides: [],
                grid: { snap: false, spacingMm: 1 },
                drawSides: 6,
                polygonMode: 'inscribed',
            },
        },
        draftRef: { current: null },
        pendingAnchorRef: { current: null },
        clicksRef: { current: [] },
        cursorRef: { current: null },
        downRef: { current: null },
        angleSnapRef: { current: null },
        forceTick: jest.fn(),
        onCommitLoop: jest.fn(),
        updateCursor: jest.fn(),
    } as unknown as CanvasPointerControllerProps;
    const event = (x: number, y: number) =>
        ({
            clientX: x,
            clientY: 100 - y,
            buttons: 0,
            shiftKey: false,
        }) as CanvasMouseEvent;
    const click = (x: number, y: number) =>
        finishDraw(event(x, y), deps, { x, y: 100 - y }, null);
    return { deps, event, click };
}
test('slot takes two canvas end centres, previews width, and commits on the third pick', () => {
    const { deps, event, click } = setup('slot');
    click(30, 30);
    updateDrawDraft(event(80, 30), deps);
    click(80, 30);
    expect(deps.onCommitLoop).not.toHaveBeenCalled();
    updateDrawDraft(event(80, 40), deps);
    expect(deps.draftRef.current?.slotWidth).toBe(20);
    click(80, 40);
    expect(deps.onCommitLoop).toHaveBeenCalledTimes(1);
    expect(deps.onCommitLoop).toHaveBeenCalledWith(
        expect.arrayContaining([
            { x: 80, y: 20 },
            { x: 80, y: 40 },
        ]),
        { sourceType: 'slot' },
    );
    expect(deps.clicksRef.current).toEqual([]);
    expect(deps.pendingAnchorRef.current).toBeNull();
    // The tool remains armed, just like Circle.
    click(100, 100);
    expect(deps.onCommitLoop).toHaveBeenCalledTimes(1);
    expect(deps.clicksRef.current).toHaveLength(1);
});
test('ellipse uses a centre pick and independent live radii before the second pick', () => {
    const { deps, event, click } = setup('ellipse');
    click(10, 10);
    updateDrawDraft(event(40, 30), deps);
    expect(deps.onCommitLoop).not.toHaveBeenCalled();
    click(40, 30);
    const points = (deps.onCommitLoop as jest.Mock).mock.calls[0][0] as {
        x: number;
        y: number;
    }[];
    expect(Math.min(...points.map((p) => p.x))).toBe(-20);
    expect(Math.max(...points.map((p) => p.y))).toBe(30);
});
test('rounded rectangle keeps the inline radius when the opposite corner is picked', () => {
    const { deps, event, click } = setup('rounded-rectangle');
    click(10, 10);
    updateDrawDraft(event(70, 50), deps);
    deps.draftRef.current!.cornerRadius = 8;
    click(70, 50);
    expect(deps.onCommitLoop).toHaveBeenCalledWith(
        expect.arrayContaining([{ x: 70, y: 42 }]),
        expect.objectContaining({ sourceType: 'rounded-rectangle' }),
    );
});
