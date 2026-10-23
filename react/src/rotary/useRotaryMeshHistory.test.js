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
