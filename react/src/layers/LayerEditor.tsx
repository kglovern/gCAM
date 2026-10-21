import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { DrawingLayer } from './model';

/** Infrequent layer metadata edits expand only while needed. */
export function LayerEditor({
    layer,
    onSave,
    onCancel,
}: {
    layer?: DrawingLayer;
    onSave(name: string, color?: string): void;
    onCancel(): void;
}) {
    const [name, setName] = useState(layer?.name ?? '');
    const [color, setColor] = useState(layer?.color);
    return (
        <form
            className="flex flex-wrap items-center gap-1 border-t border-slate-200 p-2 dark:border-robin-900"
            onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) onSave(name.trim(), color);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    onCancel();
                }
            }}
        >
            <input
                autoFocus
                aria-label={layer ? 'Layer name' : 'New layer name'}
                value={name}
                placeholder="Layer name"
                onChange={(event) => setName(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-2 dark:border-robin-700"
            />
            {layer && (
                <>
                    <input
                        type="color"
                        aria-label="Layer colour"
                        value={color ?? '#22c55e'}
                        onChange={(event) => setColor(event.target.value)}
                        className="size-8 bg-transparent"
                    />
                    <button
                        type="button"
                        title="Use automatic colour"
                        onClick={() => setColor(undefined)}
                        className="h-8 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 px-1 text-slate-500"
                    >
                        Auto
                    </button>
                </>
            )}
            <button
                type="submit"
                aria-label={layer ? 'Save layer' : 'Create layer'}
                title="Save layer"
                disabled={!name.trim()}
                className="inline-flex size-9 [@media(pointer:coarse)]:size-11 items-center justify-center rounded bg-robin-500 text-white disabled:opacity-40"
            >
                <Check size={16} />
            </button>
            <button
                type="button"
                aria-label="Cancel layer edit"
                onClick={onCancel}
                className="inline-flex size-8 [@media(pointer:coarse)]:size-11 items-center justify-center"
            >
                <X size={16} />
            </button>
        </form>
    );
}
