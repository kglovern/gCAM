import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { PointerEvent } from 'react';
import { useProfileGestures } from './useProfileGestures';

const pointer = (pointerId: number, clientX: number, clientY = 0) =>
    ({ pointerId, clientX, clientY, pointerType: 'touch' }) as PointerEvent;

test('pinching interrupts editing, zooms, and consumes the remaining finger until lift', () => {
    const onView = jest.fn(),
        onInterrupt = jest.fn();
    const svg = {
        current: {
            getBoundingClientRect: () => ({ left: 0, width: 360 }),
        } as SVGSVGElement,
    };
    const { result } = renderHook(() =>
        useProfileGestures({ svg, zoom: 1, pan: 0, onView, onInterrupt }),
    );
    expect(result.current.begin(pointer(1, 100))).toBe(false);
    expect(result.current.begin(pointer(2, 200))).toBe(true);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    act(() => {
        expect(result.current.move(pointer(2, 300))).toBe(true);
    });
    expect(onView).toHaveBeenLastCalledWith(2, 66, 216);
    expect(result.current.end(pointer(2, 300))).toBe(true);
    expect(result.current.move(pointer(1, 110))).toBe(true);
    expect(result.current.end(pointer(1, 110))).toBe(true);
    expect(result.current.begin(pointer(3, 150))).toBe(false);
});

test('mouse editing is independent of the touch gesture state', () => {
    const onView = jest.fn(),
        onInterrupt = jest.fn();
    const { result } = renderHook(() =>
        useProfileGestures({
            svg: { current: null },
            zoom: 1,
            pan: 0,
            onView,
            onInterrupt,
        }),
    );
    expect(
        result.current.begin({
            ...pointer(1, 100),
            pointerType: 'mouse',
        } as PointerEvent),
    ).toBe(false);
    expect(
        result.current.move({
            ...pointer(1, 200),
            pointerType: 'mouse',
        } as PointerEvent),
    ).toBe(false);
    expect(onView).not.toHaveBeenCalled();
    expect(onInterrupt).not.toHaveBeenCalled();
});
