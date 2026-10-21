import { ArrowRightToLine, Eye, EyeOff, Trash2 } from 'lucide-react';
import { DEFAULT_LAYER_ID, objectLayerId, type DrawingLayer } from './model';
import type { LayerPanelProps } from './LayerPanel';

const iconButton =
    'inline-flex size-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-dark-lighter disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:size-11';

export function LayerRow({
    layer,
    commands,
    onEdit,
}: {
    layer: DrawingLayer;
    commands: LayerPanelProps;
    onEdit(): void;
}) {
    const objects = commands.loops.filter(
        (loop) => objectLayerId(loop) === layer.id,
    );
    const hidden =
        objects.length > 0 &&
        objects.every((loop) => commands.hidden.includes(loop.id));
    const active = commands.activeLayerId === layer.id;
    return (
        <div
            className={`flex items-center px-1 ${active ? 'bg-robin-500/10' : ''}`}
        >
            <button
                type="button"
                aria-label={`Select layer ${layer.name}`}
                aria-pressed={active}
                title={`${layer.name} · ${objects.length} shapes · Double-click to rename`}
                onClick={() => {
                    commands.onActivate(layer.id);
                    commands.onSelect(layer.id);
                }}
                onDoubleClick={onEdit}
                className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-slate-700 dark:text-slate-200 [@media(pointer:coarse)]:min-h-11"
            >
                <span
                    aria-hidden="true"
                    style={{ backgroundColor: layer.color }}
                    className={`size-3 shrink-0 border border-slate-400 ${layer.color ? '' : 'bg-transparent'}`}
                />
                <span className={`truncate ${active ? 'font-semibold' : ''}`}>
                    {layer.name}
                </span>
                <span className="ml-auto text-[10px] text-slate-400">
                    {objects.length}
                </span>
            </button>
            <button
                type="button"
                className={iconButton}
                aria-label={`${hidden ? 'Show' : 'Hide'} layer ${layer.name}`}
                title={`${hidden ? 'Show' : 'Hide'} layer`}
                disabled={!objects.length}
                onClick={() => commands.onToggleVisibility(layer.id)}
            >
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
                type="button"
                className={iconButton}
                aria-label={`Move selected to ${layer.name}`}
                title="Move selected shapes to this layer"
                disabled={!commands.selected.length}
                onClick={() => commands.onMove(layer.id)}
            >
                <ArrowRightToLine size={14} />
            </button>
            <button
                type="button"
                className={`${iconButton} hover:text-red-500`}
                aria-label={`Remove layer ${layer.name}; keep shapes in Default`}
                title="Remove layer; keep shapes in Default"
                disabled={layer.id === DEFAULT_LAYER_ID}
                onClick={() => commands.onDelete(layer.id)}
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}
