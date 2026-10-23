import { jest } from '@jest/globals';
import { fireEvent, renderHook } from '@testing-library/react';
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts';

function setup(overrides = {}) {
    const options = {
        hasSelection: true, canNudge: true, nudgeStep: 1,
        nudgeSelected: jest.fn(), setActiveTool: jest.fn(), clearTransform: jest.fn(),
        clearGuidePlacement: jest.fn(), fitViewport: jest.fn(), undo: jest.fn(),
        redo: jest.fn(), deleteSelected: jest.fn<() => void>(), duplicateSelected: jest.fn(),
        ...overrides,
    };
    renderHook(() => useAppKeyboardShortcuts(options));
    return options;
}

test.each([
    ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0],
    ['ArrowUp', 0, 1], ['ArrowDown', 0, -1],
])('%s nudges and prevents scrolling', (key, dx, dy) => {
    const options = setup();
    expect(fireEvent.keyDown(window, { key })).toBe(false);
    expect(options.nudgeSelected).toHaveBeenCalledWith(dx, dy);
});

test('Shift multiplies the inch step by ten', () => {
    const options = setup({ nudgeStep: 0.254 });
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(options.nudgeSelected).toHaveBeenCalledWith(2.54, 0);
});

test.each([{ hasSelection: false }, { canNudge: false }])('ignores unavailable selections: %o', (override) => {
    const options = setup(override);
    expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(true);
    expect(options.nudgeSelected).not.toHaveBeenCalled();
});

test.each(['input', 'textarea', 'select', 'div'])('preserves editing in %s', (tag) => {
    const options = setup();
    const element = document.createElement(tag);
    if (tag === 'div') element.setAttribute('contenteditable', 'true');
    document.body.append(element);
    fireEvent.keyDown(element, { key: 'ArrowUp' });
    expect(options.nudgeSelected).not.toHaveBeenCalled();
    element.remove();
});

test.each(['ctrlKey', 'metaKey', 'altKey'])('ignores %s arrows', (modifier) => {
    const options = setup();
    fireEvent.keyDown(window, { key: 'ArrowRight', [modifier]: true });
    expect(options.nudgeSelected).not.toHaveBeenCalled();
});
