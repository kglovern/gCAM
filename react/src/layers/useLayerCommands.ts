import type { Dispatch, SetStateAction } from 'react';
import type { ViewLoop } from '../canvas/types';
import {
    DEFAULT_LAYER_ID,
    normalizeLayers,
    objectLayerId,
    type DrawingLayer,
} from './model';

interface Options {
    loops: ViewLoop[];
    layers: DrawingLayer[];
    activeLayerId: string;
    selected: string[];
    hidden: string[];
    setLoops: Dispatch<SetStateAction<ViewLoop[]>>;
    setLayers: Dispatch<SetStateAction<DrawingLayer[]>>;
    setActiveLayerId: Dispatch<SetStateAction<string>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setHidden: Dispatch<SetStateAction<string[]>>;
    pushHistory(): void;
}
/** Layer edits share document history; changing display metadata never edits toolpaths. */
export function useLayerCommands(options: Options) {
    const layers = normalizeLayers(options.layers, options.loops);
    const updateLayer = (
        id: string,
        change: Partial<Pick<DrawingLayer, 'name' | 'color'>>,
    ) => {
        if (change.name !== undefined && !change.name.trim()) return;
        const previous = layers.find((layer) => layer.id === id);
        if (!previous) return;
        const next = {
            ...previous,
            ...change,
            name: change.name?.trim() ?? previous.name,
        };
        if (next.name === previous.name && next.color === previous.color)
            return;
        options.pushHistory();
        options.setLayers(
            layers.map((layer) => (layer.id === id ? next : layer)),
        );
    };
    return {
        layers,
        activeLayerId: options.activeLayerId,
        loops: options.loops,
        selected: options.selected,
        hidden: options.hidden,
        onActivate: options.setActiveLayerId,
        onAdd(name: string) {
            if (!name.trim()) return;
            options.pushHistory();
            const id = crypto.randomUUID();
            options.setLayers([...layers, { id, name: name.trim() }]);
            options.setActiveLayerId(id);
        },
        onUpdate: updateLayer,
        onRename: (id: string, name: string) => updateLayer(id, { name }),
        onColor: (id: string, color?: string) => updateLayer(id, { color }),
        onMove(id: string) {
            if (
                !layers.some((layer) => layer.id === id) ||
                !options.selected.length
            )
                return;
            const selected = new Set(options.selected);
            if (
                !options.loops.some(
                    (loop) =>
                        selected.has(loop.id) && objectLayerId(loop) !== id,
                )
            )
                return;
            options.pushHistory();
            options.setLoops(
                options.loops.map((loop) =>
                    selected.has(loop.id) ? { ...loop, layerId: id } : loop,
                ),
            );
        },
        onSelect(id: string) {
            options.setSelected(
                options.loops
                    .filter(
                        (loop) =>
                            objectLayerId(loop) === id &&
                            !options.hidden.includes(loop.id),
                    )
                    .map((loop) => loop.id),
            );
        },
        onToggleVisibility(id: string) {
            const ids = options.loops
                .filter((loop) => objectLayerId(loop) === id)
                .map((loop) => loop.id);
            if (!ids.length) return;
            options.pushHistory();
            const allHidden = ids.every((id) => options.hidden.includes(id));
            options.setHidden(
                allHidden
                    ? options.hidden.filter((id) => !ids.includes(id))
                    : [...new Set([...options.hidden, ...ids])],
            );
            if (!allHidden)
                options.setSelected(
                    options.selected.filter((id) => !ids.includes(id)),
                );
        },
        onDelete(id: string) {
            if (
                id === DEFAULT_LAYER_ID ||
                !layers.some((layer) => layer.id === id)
            )
                return;
            options.pushHistory();
            options.setLoops(
                options.loops.map((loop) =>
                    objectLayerId(loop) === id
                        ? { ...loop, layerId: DEFAULT_LAYER_ID }
                        : loop,
                ),
            );
            options.setLayers(layers.filter((layer) => layer.id !== id));
            if (options.activeLayerId === id)
                options.setActiveLayerId(DEFAULT_LAYER_ID);
        },
    };
}
