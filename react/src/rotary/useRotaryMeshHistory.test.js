import fs from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import { useRotaryState } from './useRotaryState';
const bytes = fs.readFileSync('cypress/fixtures/rotary-asymmetric.stl');
const file = (name) => ({
    name,
    arrayBuffer: async () =>
        bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
        ),
});
test('Undo and project restore resolve the actual STL, never a fitted turning fallback', async () => {
    const { result } = renderHook(() => useRotaryState());
    const empty = result.current.snapshotProject();
    await act(() => result.current.importStlFile(file('first.stl')));
    const first = result.current.stlMesh.key,
        project = result.current.snapshotProject();
    await act(() => result.current.importStlFile(file('second.stl')));
    const second = result.current.stlMesh.key;
    expect(first).not.toBe(second);
    act(() => result.current.undo());
    expect(result.current.mode).toBe('stl');
    expect(result.current.stlMesh.key).toBe(first);
    act(() => result.current.redo());
    expect(result.current.stlMesh.key).toBe(second);
    act(() => result.current.restoreProject(project));
    expect(result.current.stlMesh.key).toBe(first);
    act(() => result.current.restoreProject(empty));
    expect(result.current.stlMesh).toBeNull();
    act(() => result.current.undo());
    expect(result.current.mode).toBe('stl');
    expect(result.current.stlMesh.key).toBe(first);
});

test('importing STL initializes mesh settings for an already selected cutter', async () => {
    const { result } = renderHook(() => useRotaryState());
    act(() => result.current.setTool((tool) => ({ ...tool, dia: 0.5 })));
    await act(() => result.current.importStlFile(file('small-cutter.stl')));
    expect(result.current.opsBase.mesh.cellSize).toBeLessThanOrEqual(0.125);
    expect(result.current.opsBase.mesh.stepover).toBeLessThanOrEqual(0.25);
});

test('import keeps measured blank dimensions and scales inch models before fitting', async () => {
    const { result } = renderHook(() => useRotaryState());
    act(() =>
        result.current.setStock((stock) => ({
            ...stock,
            length: 300,
            diameter: 50,
        })),
    );
    await act(() =>
        result.current.importStlFile(file('inches.stl'), 'auto', true, 25.4),
    );
    expect(result.current.stock.length).toBe(300);
    expect(result.current.stock.diameter).toBe(50);
    expect(Number(result.current.stlInfo.len)).toBeGreaterThan(100);
});
