import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useRotaryExport } from './useRotaryExport';
import type { UseRotaryState } from '../useRotaryState';

function model() {
    return {
        mode: 'profile',
        stlMesh: null,
        gcode: '',
        flags: [],
        moves: [{ x: 20 }],
        generate: jest.fn(),
        snapshotProject: () => ({ name: 'test', stock: { length: 90 } }),
    } as unknown as UseRotaryState;
}
test('export becomes stale when the stock or geometry changes', () => {
    const rotary = model();
    const { result, rerender } = renderHook(
        ({ state }) => useRotaryExport(state),
        { initialProps: { state: rotary } },
    );
    expect(result.current.ready).toBe(false);
    act(() => result.current.generate());
    expect(rotary.generate).toHaveBeenCalledTimes(1);
    rerender({ state: { ...rotary, gcode: 'G21' } });
    expect(result.current.ready).toBe(true);
    rerender({
        state: {
            ...rotary,
            gcode: 'G21',
            snapshotProject: (() => ({
                name: 'test',
                stock: { length: 120 },
            })) as UseRotaryState['snapshotProject'],
        },
    });
    expect(result.current.ready).toBe(false);
});
test('missing STL and blocking checks prevent generation', () => {
    const rotary = model();
    const { result, rerender } = renderHook(
        ({ state }) => useRotaryExport(state),
        { initialProps: { state: { ...rotary, mode: 'stl' as const } } },
    );
    act(() => result.current.generate());
    expect(result.current.needsModel).toBe(true);
    expect(rotary.generate).not.toHaveBeenCalled();
    rerender({
        state: {
            ...rotary,
            mode: 'stl',
            flags: [{ level: 'e', msg: 'Stock too small' }],
        },
    });
    expect(result.current.errors).toBe(2);
});
