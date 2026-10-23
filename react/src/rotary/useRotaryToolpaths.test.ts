import { useSynchronousPlan } from './test-stubs/planning';
jest.unstable_mockModule('./useMeshPlan', () => ({
    useMeshPlan: useSynchronousPlan,
}));
const { useRotaryState } = await import('./useRotaryState');
import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { UseRotaryState } from './useRotaryState';
import { isRotaryProjectSlice } from './engine/types';

const add = (
    result: { current: UseRotaryState },
    operation: 'rough' | 'finish' | 'part',
    slot = 1,
) => {
    act(() => {
        result.current.setOperation(operation);
        result.current.setTool((tool) => ({
            ...tool,
            type: 'flat',
            slotNum: slot,
            feed: slot * 500,
            spindle: slot * 5000,
        }));
    });
    act(() => result.current.saveToolpath());
};
test('only added operations export, with independent tools and safe tool changes', () => {
    const { result } = renderHook(() => useRotaryState());
    act(() => result.current.generate());
    expect(result.current.gcode).toBe('');
    add(result, 'rough');
    add(result, 'finish', 2);
    act(() => result.current.generate());
    const code = result.current.gcode;
    expect(code).toContain('(rough)');
    expect(code).toContain('(finish)');
    expect(code).not.toContain('(face)');
    expect(code).toContain('G0Z32.700\r\n(Change to T1)\r\nM6');
    expect(code).toContain('S5000M3');
    expect(code).toContain('S10000M3');
    expect(code).toMatch(
        /M5[\s\S]*T2[\s\S]*G0Z32.700\r\n\(Change to T2\)\r\nM6[\s\S]*S10000M3/,
    );
    expect(code.match(/^M2$/gm)).toHaveLength(1);
    expect(result.current.programs[0].gcode).not.toContain('(finish)');
    expect(result.current.toolpaths[0].tool.feed).toBe(500);
    act(() => result.current.setTool((tool) => ({ ...tool, feed: 9000 })));
    expect(result.current.toolpaths[0].tool.feed).toBe(500);
});
test('edit, cancel, reorder, delete and undo operate on the saved list', () => {
    const { result } = renderHook(() => useRotaryState());
    add(result, 'rough');
    add(result, 'finish', 2);
    const first = result.current.toolpaths[0].id;
    act(() => result.current.editToolpath(first));
    act(() => result.current.setTool((tool) => ({ ...tool, feed: 777 })));
    act(() => result.current.cancelToolpathEdit());
    expect(result.current.toolpaths[0].tool.feed).toBe(500);
    act(() => result.current.editToolpath(first));
    act(() => result.current.setTool((tool) => ({ ...tool, feed: 777 })));
    act(() => result.current.saveToolpath());
    expect(result.current.toolpaths).toHaveLength(2);
    expect(result.current.toolpaths[0].tool.feed).toBe(777);
    act(() => result.current.moveToolpath(first, 1));
    expect(result.current.toolpaths[1].id).toBe(first);
    act(() => result.current.removeToolpath(first));
    expect(result.current.toolpaths).toHaveLength(1);
    act(() => result.current.undo());
    expect(result.current.toolpaths).toHaveLength(2);
    expect(result.current.toolpaths[1].id).toBe(first);
});
test('project roundtrip preserves entries and old operation toggles migrate', () => {
    const { result } = renderHook(() => useRotaryState());
    add(result, 'finish', 2);
    const saved = result.current.snapshotProject();
    expect(isRotaryProjectSlice(saved)).toBe(true);
    act(() => result.current.removeToolpath(result.current.toolpaths[0].id));
    act(() => {
        expect(
            result.current.restoreProject(JSON.parse(JSON.stringify(saved))),
        ).toBe(true);
    });
    expect(result.current.toolpaths[0].operation).toBe('finish');
    const { toolpaths, ...legacy } = saved;
    act(() =>
        result.current.restoreProject({
            ...legacy,
            ops: { ...legacy.ops, face: true, rough: true, finish: true },
        }),
    );
    expect(result.current.toolpaths.map((entry) => entry.operation)).toEqual([
        'face',
        'rough',
        'finish',
    ]);
    expect(
        isRotaryProjectSlice({
            ...saved,
            toolpaths: [
                {
                    ...toolpaths![0],
                    tool: { ...toolpaths![0].tool, feed: NaN },
                },
            ],
        }),
    ).toBe(false);
    expect(
        isRotaryProjectSlice({
            ...saved,
            toolpaths: [toolpaths![0], toolpaths![0]],
        }),
    ).toBe(false);
});
test('part-off before another operation blocks output until reordered', () => {
    const { result } = renderHook(() => useRotaryState());
    add(result, 'part');
    add(result, 'finish', 2);
    expect(
        result.current.flags.some(
            (flag) => flag.level === 'e' && flag.msg.includes('last'),
        ),
    ).toBe(true);
    act(() => result.current.generate());
    expect(result.current.gcode).toBe('');
    act(() => result.current.moveToolpath(result.current.toolpaths[0].id, 1));
    act(() => result.current.generate());
    expect(result.current.gcode).toContain('(part)');
});

test('invalid pass depth cannot add a toolpath or enter the planner', () => {
    const { result } = renderHook(() => useRotaryState());
    act(() => result.current.setOpsBase((ops) => ({ ...ops, roughStep: 0 })));
    expect(result.current.draftFlags[0].level).toBe('e');
    act(() => result.current.saveToolpath());
    expect(result.current.toolpaths).toHaveLength(0);
});

test('missing STL on project restore stays in STL mode and blocks envelope fallback', () => {
    const { result } = renderHook(() => useRotaryState());
    const saved = result.current.snapshotProject();
    act(() =>
        result.current.restoreProject({
            ...saved,
            mode: 'stl',
            stlKey: 'missing-mesh',
        }),
    );
    expect(result.current.mode).toBe('stl');
    expect(result.current.stlMesh).toBeNull();
    act(() => result.current.generate());
    expect(result.current.gcode).toBe('');
    expect(result.current.flags.some((f) => f.level === 'e')).toBe(true);
});

test('deleting the last saved path returns to the editor instead of leaving export controls visible', () => {
    const { result } = renderHook(() => useRotaryState());
    add(result, 'finish');
    expect(result.current.toolpathEditorOpen).toBe(false);
    act(() => result.current.removeToolpath(result.current.toolpaths[0].id));
    expect(result.current.toolpaths).toHaveLength(0);
    expect(result.current.toolpathEditorOpen).toBe(true);
});

test('project roundtrip retains a finishing draft and the entry being edited', () => {
    const { result } = renderHook(() => useRotaryState());
    add(result, 'finish');
    act(() => result.current.editToolpath(result.current.toolpaths[0].id));
    const saved = result.current.snapshotProject();
    act(() => result.current.setOperation('rough'));
    act(() => result.current.restoreProject(saved));
    expect(result.current.operation).toBe('finish');
    expect(result.current.toolpathEditorOpen).toBe(true);
    expect(result.current.editingToolpathId).toBe(saved.editingToolpathId);
});
