import { useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { DEFAULT_LAYER_ID, objectLayerId } from './model';
import type { useLayerCommands } from './useLayerCommands';
export type LayerPanelProps = ReturnType<typeof useLayerCommands>;
const button =
    'min-h-11 rounded border border-slate-300 px-2 dark:border-robin-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-dark-lighter';
/** Named layers work without colour and expose the same actions to touch and keyboard. */
export function LayerPanel(props: LayerPanelProps) {
    const [name, setName] = useState('');
    return (
        <section
            aria-label="Drawing layers"
            className="border-b border-slate-200 p-2 dark:border-robin-900 space-y-2"
        >
            <h3 className="font-medium">Layers</h3>
            <form
                className="flex gap-1"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (name.trim()) {
                        props.onAdd(name);
                        setName('');
                    }
                }}
            >
                <input
                    aria-label="New layer name"
                    placeholder="e.g. Pockets"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-h-11 min-w-0 flex-1 rounded border border-slate-300 px-2 bg-transparent dark:border-robin-700"
                />
                <button className={button} disabled={!name.trim()}>
                    Add
                </button>
            </form>
            <div className="space-y-1">
                {props.layers.map((layer) => {
                    const objects = props.loops.filter(
                        (loop) => objectLayerId(loop) === layer.id,
                    );
                    const hidden =
                        objects.length > 0 &&
                        objects.every((loop) => props.hidden.includes(loop.id));
                    return (
                        <div
                            key={layer.id}
                            className={`rounded border p-1 ${props.activeLayerId === layer.id ? 'border-robin-500 bg-robin-500/10' : 'border-transparent'}`}
                        >
                            <div className="flex items-center gap-1">
                                <input
                                    type="radio"
                                    name="active-drawing-layer"
                                    aria-label={`Draw on ${layer.name}`}
                                    checked={props.activeLayerId === layer.id}
                                    onChange={() => props.onActivate(layer.id)}
                                    className="size-5 shrink-0"
                                />
                                <input
                                    aria-label={`Rename layer ${layer.name}`}
                                    key={layer.name}
                                    defaultValue={layer.name}
                                    onBlur={(event) => {
                                        const value = event.target.value.trim();
                                        if (value)
                                            props.onRename(layer.id, value);
                                        else event.target.value = layer.name;
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter')
                                            event.currentTarget.blur();
                                    }}
                                    className="min-w-0 min-h-11 flex-1 rounded bg-transparent px-1"
                                />
                                <span className="text-slate-500">
                                    {objects.length}
                                </span>
                                <button
                                    className="min-h-11 min-w-11 flex items-center justify-center"
                                    aria-label={`${hidden ? 'Show' : 'Hide'} layer ${layer.name}`}
                                    disabled={!objects.length}
                                    onClick={() =>
                                        props.onToggleVisibility(layer.id)
                                    }
                                >
                                    {hidden ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                            </div>
                            <div className="flex gap-1 items-center flex-wrap">
                                <input
                                    type="color"
                                    aria-label={`Colour for ${layer.name}`}
                                    value={layer.color ?? '#22c55e'}
                                    onChange={(event) =>
                                        props.onColor(
                                            layer.id,
                                            event.target.value,
                                        )
                                    }
                                    className="h-11 w-11 bg-transparent"
                                />
                                {layer.color && (
                                    <button
                                        className={button}
                                        aria-label={`Clear colour for ${layer.name}`}
                                        onClick={() => props.onColor(layer.id)}
                                    >
                                        Auto
                                    </button>
                                )}
                                <button
                                    className={button}
                                    disabled={!objects.length}
                                    onClick={() => props.onSelect(layer.id)}
                                >
                                    Select
                                </button>
                                <button
                                    className={button}
                                    disabled={!props.selected.length}
                                    onClick={() => props.onMove(layer.id)}
                                >
                                    Move selected
                                </button>
                                {layer.id !== DEFAULT_LAYER_ID && (
                                    <button
                                        className="min-h-11 min-w-11 flex items-center justify-center text-slate-500 hover:text-red-500"
                                        aria-label={`Remove layer ${layer.name}; keep shapes in Default`}
                                        title="Remove layer; move its shapes to Default"
                                        onClick={() => props.onDelete(layer.id)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="text-slate-500">
                Select a layer's shapes, then choose a toolpath. The active
                layer receives new drawings.
            </p>
        </section>
    );
}
