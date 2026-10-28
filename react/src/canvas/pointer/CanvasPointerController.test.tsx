import { fireEvent, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CanvasPointerController } from './CanvasPointerController';
import type { CanvasPointerControllerProps } from './types';

function renderPointerController(onViewportLeave: () => void) {
    return render(
        <div>
            <CanvasPointerController
                {...({
                    onViewportLeave,
                    viewRef: { current: { drawTool: null } },
                } as unknown as CanvasPointerControllerProps)}
            />
            <label data-testid="floating-pill">
                Radius <input />
            </label>
        </div>,
    );
}

test('keeps the active draft when the pointer moves from canvas onto a floating input', () => {
    const onViewportLeave = jest.fn();
    const { container, getByTestId } = renderPointerController(onViewportLeave);
    const canvas = container.querySelector('canvas');
    const pill = getByTestId('floating-pill');

    expect(canvas).not.toBeNull();
    fireEvent.mouseLeave(canvas as HTMLCanvasElement, { relatedTarget: pill });

    expect(onViewportLeave).not.toHaveBeenCalled();
});

test('clears pointer state when leaving the combined canvas and HUD region', () => {
    const onViewportLeave = jest.fn();
    const { container } = renderPointerController(onViewportLeave);
    const canvas = container.querySelector('canvas');

    expect(canvas).not.toBeNull();
    fireEvent.mouseLeave(canvas as HTMLCanvasElement, {
        relatedTarget: document.body,
    });

    expect(onViewportLeave).toHaveBeenCalledTimes(1);
});
