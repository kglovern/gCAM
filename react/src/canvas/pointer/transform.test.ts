import { jest } from '@jest/globals';
import { handleCornerDown, updateCornerHover } from './transform';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';
test('Dogbone can hover and edit an unselected visible shape while selection stays elsewhere', () => {
    const square = (x: number) => [
        { x, y: 0 },
        { x: x + 20, y: 0 },
        { x: x + 20, y: 20 },
        { x, y: 20 },
        { x, y: 0 },
    ];
    const onFilletCorner = jest.fn();
    const deps = {
        viewRef: {
            current: {
                cornerTool: 'dogbone',
                loops: [
                    { id: 'a', points: square(0) },
                    { id: 'b', points: square(50) },
                ],
                selected: ['a'],
                hidden: [],
            },
        },
        canvasRef: {
            current: {
                getBoundingClientRect: () => ({ left: 0, top: 0 }),
                style: {},
            },
        },
        cameraRef: { current: { scale: 1, tx: 0, ty: 100 } },
        cornerHoverRef: { current: null },
        downRef: { current: null },
        onFilletCorner,
        forceTick: jest.fn(),
        updateCursor: jest.fn(),
    } as unknown as CanvasPointerControllerProps;
    const event = {
        clientX: 70,
        clientY: 80,
        button: 0,
        buttons: 0,
        preventDefault: jest.fn(),
    } as unknown as CanvasMouseEvent;
    expect(updateCornerHover(event, deps)).toBe(true);
    expect(deps.cornerHoverRef.current?.loopId).toBe('b');
    expect(handleCornerDown(event, deps)).toBe(true);
    expect(onFilletCorner).toHaveBeenCalledWith('b', 2, undefined);
    deps.viewRef.current.hidden = ['b'];
    updateCornerHover(event, deps);
    expect(deps.cornerHoverRef.current).toBeNull();
});
