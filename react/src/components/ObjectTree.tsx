/**
 * Purpose: Implementation module for ObjectTree in the components domain.
 */
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { LayerPanel, type LayerPanelProps } from '../layers/LayerPanel';
import { useState } from 'react';
import type { ViewLoop } from '../canvas/types';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';

export interface TreeBitmap {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Object browser: vector list with select, visibility and delete.
 * Mirrors the legacy object-tree panel in gSender compact styling.
 */
export function ObjectTree({
    layerPanel,
    loops,
    bitmaps,
    selected,
    hidden,
    onSelect,
    onToggleHidden,
    onDelete,
    onGroup,
    onUngroup,
    canGroup = false,
    canUngroup = false,
    onEdit,
    onMove,
    onResize,
    onClose,
    units,
}: {
    layerPanel?: LayerPanelProps;
    loops: ViewLoop[];
    bitmaps: TreeBitmap[];
    selected: string[];
    hidden: string[];
    onSelect: (ids: string[]) => void;
    onToggleHidden: (id: string) => void;
    onDelete: (id: string) => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    canGroup?: boolean;
    canUngroup?: boolean;
    onEdit?: () => void;
    onMove?: () => void;
    onResize?: () => void;
    onClose: () => void;
    units: UnitSystem;
}) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [context, setContext] = useState<{
        id: string;
        x: number;
        y: number;
    } | null>(null);
    const hide = new Set(hidden);
    const groupNames = Array.from(
        new Set(loops.map((loop) => loop.groupId).filter(Boolean) as string[]),
    );
    const labelFor = (loop: ViewLoop, index: number) => {
        if (loop.bitmapId) {
            const bm = bitmaps.find((b) => b.id === loop.bitmapId);
            return bm
                ? `Bitmap ${displayValue(bm.w, units)}×${displayValue(bm.h, units)}${lengthUnit(units)}`
                : 'Bitmap';
        }
        return `Vector ${index + 1} (${loop.points.length} pts)`;
    };
    return (
        <aside className="absolute top-2 left-2 z-10 w-80 max-w-[calc(100%-1rem)] max-h-[85%] flex flex-col rounded border border-slate-300 bg-white/95 text-xs text-slate-700 shadow-lg dark:border-robin-900 dark:bg-dark/95 dark:text-slate-200">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 dark:border-robin-900">
                <span className="font-medium text-slate-900 dark:text-white">
                    Objects
                </span>
                <button
                    onClick={onClose}
                    aria-label="Close object browser"
                    className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                    ×
                </button>
            </div>
            {(onGroup || onUngroup || onEdit || onMove || onResize) && (
                <div className="flex gap-1 border-b border-slate-200 px-2 py-1.5 dark:border-robin-900">
                    {onGroup && (
                        <button
                            onClick={onGroup}
                            disabled={!canGroup}
                            className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-300 dark:hover:bg-dark-lighter disabled:opacity-40"
                        >
                            Group
                        </button>
                    )}
                    {onUngroup && (
                        <button
                            onClick={onUngroup}
                            disabled={!canUngroup}
                            className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-300 dark:hover:bg-dark-lighter disabled:opacity-40"
                        >
                            Ungroup
                        </button>
                    )}
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            disabled={!selected.length}
                            className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-300 dark:hover:bg-dark-lighter disabled:opacity-40"
                        >
                            Edit
                        </button>
                    )}
                    {onMove && (
                        <button
                            onClick={onMove}
                            disabled={!selected.length}
                            className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-300 dark:hover:bg-dark-lighter disabled:opacity-40"
                        >
                            Move
                        </button>
                    )}
                    {onResize && (
                        <button
                            onClick={onResize}
                            disabled={!selected.length}
                            className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-300 dark:hover:bg-dark-lighter disabled:opacity-40"
                        >
                            Resize
                        </button>
                    )}
                </div>
            )}
            <div className="overflow-y-auto no-scrollbar">
                {layerPanel && <LayerPanel {...layerPanel} />}
                {!loops.length && (
                    <div className="px-2 py-3 text-slate-500 text-center">
                        No objects
                    </div>
                )}
                {groupNames.map((groupId) => (
                    <div
                        key={`group-${groupId}`}
                        className="border-b border-slate-200 px-2 py-1 text-robin-600 dark:border-robin-900/60 dark:text-robin-300"
                    >
                        <button
                            className="flex w-full items-center gap-1 text-left"
                            onClick={() =>
                                setCollapsed((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(groupId)) next.delete(groupId);
                                    else next.add(groupId);
                                    return next;
                                })
                            }
                        >
                            {collapsed.has(groupId) ? (
                                <ChevronRight size={13} />
                            ) : (
                                <ChevronDown size={13} />
                            )}
                            Group {groupId.replace(/^group-/, '')}
                        </button>
                    </div>
                ))}
                {loops.map((loop, i) => {
                    if (loop.groupId && collapsed.has(loop.groupId))
                        return null;
                    const isHidden = hide.has(loop.id);
                    const isSelected = selected.includes(loop.id);
                    return (
                        <div
                            key={loop.id}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                onSelect([loop.id]);
                                setContext({
                                    id: loop.id,
                                    x: event.clientX,
                                    y: event.clientY,
                                });
                            }}
                            className={`flex items-center gap-1 px-2 py-1 ${loop.groupId ? 'pl-4' : ''} ${
                                isSelected
                                    ? 'bg-robin-500/30 text-white'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                            } ${isHidden ? 'opacity-40' : ''}`}
                        >
                            <button
                                className="flex-1 truncate text-left"
                                onClick={(event) => {
                                    if (event.ctrlKey || event.metaKey) {
                                        onSelect(
                                            isSelected
                                                ? selected.filter(
                                                      (id) => id !== loop.id,
                                                  )
                                                : [...selected, loop.id],
                                        );
                                    } else {
                                        onSelect([loop.id]);
                                    }
                                }}
                            >
                                {labelFor(loop, i)}
                            </button>
                            <button
                                aria-label={
                                    isHidden
                                        ? `Show ${loop.id}`
                                        : `Hide ${loop.id}`
                                }
                                onClick={() => onToggleHidden(loop.id)}
                                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                {isHidden ? (
                                    <EyeOff size={13} />
                                ) : (
                                    <Eye size={13} />
                                )}
                            </button>
                            <button
                                aria-label={`Delete ${loop.id}`}
                                onClick={() => onDelete(loop.id)}
                                className="text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    );
                })}
            </div>
            {context && (
                <div
                    className="fixed z-50 min-w-28 rounded border border-slate-300 bg-white p-1 shadow-lg dark:border-robin-700 dark:bg-dark"
                    style={{ left: context.x, top: context.y }}
                    onMouseLeave={() => setContext(null)}
                >
                    <button
                        className="block w-full rounded px-2 py-1 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-dark-lighter"
                        onClick={() => {
                            onSelect([context.id]);
                            setContext(null);
                        }}
                    >
                        Select
                    </button>
                    <button
                        className="block w-full rounded px-2 py-1 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-dark-lighter"
                        onClick={() => {
                            onToggleHidden(context.id);
                            setContext(null);
                        }}
                    >
                        Toggle visibility
                    </button>
                    <button
                        className="block w-full rounded px-2 py-1 text-left text-red-500 hover:bg-slate-100 dark:text-red-300 dark:hover:bg-dark-lighter"
                        onClick={() => {
                            onDelete(context.id);
                            setContext(null);
                        }}
                    >
                        Delete
                    </button>
                </div>
            )}
        </aside>
    );
}
