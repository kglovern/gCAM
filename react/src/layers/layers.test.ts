import { layerDisplayColor } from './displayColor';
import { act, renderHook } from '@testing-library/react';
import { normalizeLayers, DEFAULT_LAYER } from './model';
import { useDocumentState } from '../document/useDocumentState';
import { useLayerCommands } from './useLayerCommands';
import type { ViewLoop } from '../canvas/types';
import { serializeProject, deserializeProject } from '../lib/project';
import { DEFAULT_JOB_STOCK } from '../job/stock';

function useLayers() {
    const document = useDocumentState<ViewLoop, never, never, never>({
        clone: (snapshot) => JSON.parse(JSON.stringify(snapshot)),
    });
    const commands = useLayerCommands({
        ...document,
        pushHistory: document.push,
    });
    return { document, commands };
}
test('legacy geometry, missing references and invalid colours are repaired', () => {
    expect(
        normalizeLayers(
            [{ id: 'cuts', name: ' Cuts ', color: 'url(x)' }],
            [{ layerId: 'missing' }],
        ),
    ).toEqual([
        DEFAULT_LAYER,
        { id: 'cuts', name: 'Cuts' },
        { id: 'missing', name: 'missing' },
    ]);
});
test('create, assign, rename and remove a layer share document undo and redo', () => {
    const { result } = renderHook(useLayers);
    act(() => result.current.document.setLoops([{ id: 'a', points: [] }]));
    act(() => result.current.document.setSelected(['a']));
    act(() => result.current.commands.onAdd('Pockets'));
    const id = result.current.document.activeLayerId;
    act(() => result.current.commands.onMove(id));
    expect(result.current.document.loops[0].layerId).toBe(id);
    act(() => result.current.commands.onRename(id, 'Shallow pockets'));
    act(() => result.current.commands.onDelete(id));
    expect(result.current.document.loops[0].layerId).toBe('default');
    act(() => result.current.document.undo());
    expect(result.current.document.loops[0].layerId).toBe(id);
    expect(
        result.current.document.layers.find((layer) => layer.id === id)?.name,
    ).toBe('Shallow pockets');
    act(() => result.current.document.redo());
    expect(result.current.document.layers).toEqual([DEFAULT_LAYER]);
});
test('layer visibility clears hidden selection and selects visible shapes for CAM', () => {
    const { result } = renderHook(useLayers);
    act(() => {
        result.current.document.setLoops([
            { id: 'a', points: [] },
            { id: 'b', points: [], layerId: 'cuts' },
        ]);
        result.current.document.setSelected(['a', 'b']);
    });
    act(() => result.current.commands.onToggleVisibility('cuts'));
    expect(result.current.document.hidden).toEqual(['b']);
    expect(result.current.document.selected).toEqual(['a']);
    act(() => result.current.commands.onSelect('cuts'));
    expect(result.current.document.selected).toEqual([]);
    act(() => result.current.commands.onToggleVisibility('cuts'));
    act(() => result.current.commands.onSelect('cuts'));
    expect(result.current.document.selected).toEqual(['b']);
});
test('empty layers, colours and active layer survive portable project round trips', () => {
    const layers = [
        DEFAULT_LAYER,
        { id: 'pockets', name: 'Pockets', color: '#00ff00' },
    ];
    const project = {
        loops: [],
        selected: [],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        stock: DEFAULT_JOB_STOCK,
        fileName: 'test',
        layers,
        activeLayerId: 'pockets',
    };
    expect(deserializeProject(serializeProject(project))).toEqual(project);
});

test('layer colours remain visible on light and dark canvas backgrounds', () => {
    expect(layerDisplayColor('#ffffff', '#f8fafc', '#111827')).toBe('#111827');
    expect(layerDisplayColor('#000000', '#0b1220', '#f8fafc')).toBe('#f8fafc');
    expect(layerDisplayColor('#ff0000', '#0b1220', '#f8fafc')).toBe('#ff0000');
});
