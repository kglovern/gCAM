import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';
import type { useLayerCommands } from './useLayerCommands';
import { LayerRow } from './LayerRow';
import { LayerEditor } from './LayerEditor';

export type LayerPanelProps = ReturnType<typeof useLayerCommands>;
const iconButton =
    'inline-flex size-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-dark-lighter dark:hover:text-white disabled:opacity-30 [@media(pointer:coarse)]:size-11';

/** Compact geometry layers live alongside stock and toolpaths. */
export function LayerPanel(props: LayerPanelProps) {
    const [open, setOpen] = useState(true);
    const [editing, setEditing] = useState<string | null>(null);
    const active = props.layers.find(
        (layer) => layer.id === props.activeLayerId,
    );
    const target = props.layers.find((layer) => layer.id === editing);
    return (
        <section
            aria-label="Drawing layers"
            className="mx-3 my-2 rounded border border-slate-200 text-xs dark:border-robin-900"
        >
            <div className="flex items-center px-1">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="flex min-h-8 [@media(pointer:coarse)]:min-h-11 flex-1 items-center gap-1 px-1 text-left font-medium text-slate-700 dark:text-slate-200"
                >
                    {open ? (
                        <ChevronDown size={14} />
                    ) : (
                        <ChevronRight size={14} />
                    )}{' '}
                    Layers{' '}
                    <span className="font-normal text-slate-400">
                        {props.layers.length}
                    </span>
                </button>
                <button
                    type="button"
                    className={iconButton}
                    aria-label="Add layer"
                    title="Add layer"
                    onClick={() => {
                        setOpen(true);
                        setEditing(editing === 'new' ? null : 'new');
                    }}
                >
                    <Plus size={15} />
                </button>
                <button
                    type="button"
                    className={iconButton}
                    aria-label="Edit active layer"
                    title="Rename or colour active layer"
                    disabled={!active}
                    onClick={() => {
                        setOpen(true);
                        setEditing(
                            editing === active?.id
                                ? null
                                : (active?.id ?? null),
                        );
                    }}
                >
                    <Pencil size={14} />
                </button>
            </div>
            {open && (
                <>
                    {editing && (
                        <LayerEditor
                            key={editing}
                            layer={target}
                            onCancel={() => setEditing(null)}
                            onSave={(name, color) => {
                                if (target) {
                                    props.onUpdate(target.id, { name, color });
                                } else props.onAdd(name);
                                setEditing(null);
                            }}
                        />
                    )}
                    <div className="max-h-56 overflow-y-auto overscroll-contain border-t border-slate-200 dark:border-robin-900">
                        {props.layers.map((layer) => (
                            <LayerRow
                                key={layer.id}
                                layer={layer}
                                commands={props}
                                onEdit={() => setEditing(layer.id)}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
