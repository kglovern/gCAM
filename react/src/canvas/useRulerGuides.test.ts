import { renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { PointerEvent } from 'react';
import { useRulerGuides } from './useRulerGuides';

function setup(ruler: 'left' | 'top' = 'left') {
    const onDraft = jest.fn(),
        onPlace = jest.fn(),
        onCancel = jest.fn();
    const target = {
        focus: jest.fn(),
        setPointerCapture: jest.fn(),
        getBoundingClientRect: () =>
            ruler === 'left'
                ? { left: 0, top: 0, right: 20, bottom: 330 }
                : { left: 20, top: 0, right: 420, bottom: 30 },
    };
    const event = (x: number, y: number) =>
        ({
            clientX: x,
            clientY: y,
            button: 0,
            pointerId: 1,
            currentTarget: target,
            preventDefault: jest.fn(),
        }) as unknown as PointerEvent<HTMLCanvasElement>;
    const { result } = renderHook(() =>
        useRulerGuides({
            canvasRef: {
                current: {
                    getBoundingClientRect: () => ({
                        left: 20,
                        top: 30,
                        right: 420,
                        bottom: 330,
                    }),
                } as HTMLCanvasElement,
            },
            cameraRef: { current: { scale: 2, tx: 40, ty: 200 } },
            grid: { snap: true },
            enabled: true,
            onDraft,
            onPlace,
            onCancel,
        }),
    );
    return { handlers: result.current, event, onDraft, onPlace, onCancel };
}

test.each(['left', 'top'] as const)(
    'drag from %s ruler uses canvas coordinates and 1 mm snapping',
    (axis) => {
        const { handlers, event, onPlace, onDraft } = setup();
        const h = handlers(axis);
        h.onPointerDown(event(10, 10));
        h.onPointerMove(event(123, 123));
        expect(onDraft).toHaveBeenLastCalledWith(
            expect.objectContaining({
                cursor: { x: 31.5, y: 53.5 },
            }),
        );
        h.onPointerUp(event(123, 123));
        expect(onPlace).toHaveBeenCalledWith(
            axis === 'left'
                ? { point: { x: -0, y: 54 }, direction: { x: 1, y: 0 } }
                : { point: { x: 31, y: -0 }, direction: { x: 0, y: 1 } },
        );
    },
);

test('release outside cancels without creating a guide', () => {
    const { handlers, event, onPlace, onCancel } = setup();
    const h = handlers('left');
    h.onPointerDown(event(50, 10));
    h.onPointerUp(event(500, 10));
    expect(onPlace).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
});

test('pointer cancellation clears the preview', () => {
    const { handlers, event, onPlace, onCancel } = setup();
    const h = handlers('top');
    h.onPointerDown(event(10, 50));
    h.onPointerCancel();
    h.onPointerUp(event(100, 100));
    expect(onPlace).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
});

test('dropping over the source ruler commits the same guide as dropping on the canvas', () => {
    const { handlers, event, onPlace, onCancel } = setup();
    const h = handlers('left');
    h.onPointerDown(event(10, 100));
    h.onPointerMove(event(10, 123));
    h.onPointerUp(event(10, 123));
    expect(onPlace).toHaveBeenCalledWith({
        point: { x: -0, y: 54 },
        direction: { x: 1, y: 0 },
    });
    expect(onCancel).not.toHaveBeenCalled();
});

test('dropping on top ruler keeps a vertical guide at that ruler coordinate', () => {
    const { handlers, event, onPlace, onCancel } = setup('top');
    const h = handlers('top');
    h.onPointerDown(event(123, 10));
    h.onPointerUp(event(123, 10));
    expect(onPlace).toHaveBeenCalledWith({
        point: { x: 31, y: -0 },
        direction: { x: 0, y: 1 },
    });
    expect(onCancel).not.toHaveBeenCalled();
});
