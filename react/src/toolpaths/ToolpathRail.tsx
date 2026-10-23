import { LayerPanel, type LayerPanelProps } from '../layers/LayerPanel';
/**
 * Purpose: Implementation module for ToolpathRail in the react domain.
 */
import { FileUp, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useStableCallback } from '../lib/useStableCallback';
import type { Dispatch, SetStateAction } from 'react';
import { ToolpathPanel } from './ToolpathPanel';
import type { ToolpathStackEntry } from './useToolpathStack';
import type { ViewLoop } from '../canvas/types';
import type { PlacedTab, ProfileArgs, ToolpathResult } from '../lib/engine';
import { defaultTabsForContours, operationUsesTabs } from '../lib/tabs';
import type { UnitSystem } from '../lib/units';
import type { JobStock } from '../job/stock';
import type { MachineTravelLimits } from '../cutting-parameters/types';
import { JobStockSetup } from '../job/JobStockSetup';
import { machineProfileById } from '../cutting-parameters/machines';
import { GcodeExportButton } from './GcodeExportButton';

type Bitmap = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    img?: HTMLImageElement;
};

interface ToolpathRailProps {
    layerPanel?: LayerPanelProps;
    loops: ViewLoop[];
    selected: string[];
    bitmaps: Bitmap[];
    stack: ToolpathStackEntry[];
    gcode: string;
    fileName: string;
    units: UnitSystem;
    emitArcs: boolean;
    machineProfileId: string;
    machineTravelLimits: MachineTravelLimits;
    stock: JobStock;
    setStock: Dispatch<SetStateAction<JobStock>>;
    onFitSurface?: (id: string, mode: 'uniform' | 'z') => void;
    onStockThickness?: (value: number) => void;
    editingId: string | null;
    editingEntry: ToolpathStackEntry | null;
    tabMode: boolean;
    setTabMode: Dispatch<SetStateAction<boolean>>;
    setEditingId: Dispatch<SetStateAction<string | null>>;
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>;
    setSideTab: (tab: 'toolpaths') => void;
    setStatus: (message: string) => void;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setDraftProgress: Dispatch<
        SetStateAction<{ percent: number; label: string } | null>
    >;
    onResult: (result: ToolpathResult, args: ProfileArgs) => void;
    onUpdate: (id: string, result: ToolpathResult, args: ProfileArgs) => void;
    rebuildEntryTabs: (id: string, tabs: PlacedTab[]) => void;
    confirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        destructive?: boolean;
    }) => Promise<boolean>;
    showToast: (message: string, tone: 'info', duration: number) => void;
    onImportFile: () => void;
}

/** The toolpath form and committed-stack rail; independent from canvas layout. */
export function ToolpathRail({
    layerPanel,
    loops,
    selected,
    bitmaps,
    stack,
    gcode,
    fileName,
    units,
    emitArcs,
    machineProfileId,
    machineTravelLimits,
    stock,
    setStock,
    onFitSurface,
    onStockThickness,
    editingId,
    editingEntry,
    tabMode,
    setTabMode,
    setEditingId,
    setStack,
    setSideTab,
    setStatus,
    setDraftPreview,
    setDraftProgress,
    onResult,
    onUpdate,
    rebuildEntryTabs,
    confirm,
    showToast,
    onImportFile,
}: ToolpathRailProps) {
    const editing = Boolean(editingId && editingEntry);
    const configuring = selected.length > 0;
    const showEditor = editing || configuring;
    const emptyWorkspace =
        !loops.length &&
        !bitmaps.length &&
        !selected.length &&
        !stack.length &&
        !editing;
    const showJobStock = !showEditor;
    const panelResult = useStableCallback(onResult);
    const panelUpdate = useStableCallback(
        (id: string, result: ToolpathResult, args: ProfileArgs) =>
            onUpdate(id, result, args),
    );
    const panelFit = useStableCallback((id: string, mode: 'uniform' | 'z') =>
        onFitSurface?.(id, mode),
    );
    const panelThickness = useStableCallback((value: number) => {
        if (onStockThickness) onStockThickness(value);
        else
            setStock((current) =>
                current.thicknessMm === value
                    ? current
                    : { ...current, thicknessMm: value },
            );
    });
    const panelPreview = useStableCallback(
        (contours: { x: number; y: number }[][] | null) => {
            setDraftPreview(
                (current) => contours ?? (current.length ? [] : current),
            );
        },
    );
    const panelCancel = useStableCallback(() => {
        setEditingId(null);
        setDraftPreview((current) => (current.length ? [] : current));
        setDraftProgress(null);
        setStatus('Edit cancelled.');
    });
    const panelEntry = useMemo(
        () =>
            editingEntry
                ? {
                      id: editingEntry.id,
                      args: editingEntry.args,
                      loops: editingEntry.args.loops.map((loop, index) => ({
                          id: loop.id ?? `edit-${editingEntry.id}-${index}`,
                          points: loop.points,
                          bitmapId: (loop as { bitmapId?: string }).bitmapId,
                      })),
                  }
                : null,
        [editingEntry],
    );

    useEffect(() => {
        if (!editing && selected.length === 0) {
            setDraftPreview([]);
            setDraftProgress(null);
        }
    }, [editing, selected.length, setDraftPreview, setDraftProgress]);

    return (
        <aside className="toolpath-rail w-[340px] max-w-full shrink-0 border-l border-slate-200 bg-white dark:border-robin-900 dark:bg-dark flex flex-col min-h-0">
            <div className="toolpath-rail-content flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {showJobStock && (
                    <JobStockSetup
                        stock={stock}
                        units={units}
                        onChange={setStock}
                        maxXTravelMm={machineTravelLimits.maxXTravelMm}
                        maxYTravelMm={machineTravelLimits.maxYTravelMm}
                        machineName={
                            machineProfileById(machineProfileId)?.displayName ??
                            'Custom machine'
                        }
                    />
                )}
                {layerPanel && <LayerPanel {...layerPanel} />}
                {emptyWorkspace && (
                    <section className="mx-3 mt-1 mb-1 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Start with a design
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            Import a DXF, SVG, STL, or image to get started.
                        </p>
                        <button
                            type="button"
                            onClick={onImportFile}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                        >
                            <FileUp size={16} />
                            Import a file
                        </button>
                    </section>
                )}
                {showEditor ? (
                    <ToolpathPanel
                        onFitSurface={onFitSurface ? panelFit : undefined}
                        onStockThickness={panelThickness}
                        loops={loops}
                        selected={selected}
                        bitmaps={bitmaps}
                        submitLabel="Add Toolpath"
                        onResult={panelResult}
                        defaultArcs={emitArcs}
                        machineProfileId={machineProfileId}
                        machineTravelLimits={machineTravelLimits}
                        stock={stock}
                        units={units}
                        onDraftPreview={panelPreview}
                        onDraftProgress={setDraftProgress}
                        editEntry={panelEntry}
                        onUpdate={panelUpdate}
                        onCancelEdit={panelCancel}
                    />
                ) : (
                    <>
                        <CommittedToolpaths
                            stack={stack}
                            editingId={editingId}
                            tabMode={tabMode}
                            setTabMode={setTabMode}
                            setEditingId={setEditingId}
                            setStack={setStack}
                            setSideTab={setSideTab}
                            setStatus={setStatus}
                            rebuildEntryTabs={rebuildEntryTabs}
                            confirm={confirm}
                            showToast={showToast}
                            tightTopGap={emptyWorkspace}
                        />
                    </>
                )}
            </div>
            {!showEditor && (
                <div className="toolpath-rail-export space-y-2 shrink-0 border-t border-slate-200 p-3 dark:border-robin-900">
                    <GcodeExportButton
                        gcode={gcode}
                        fileName={fileName}
                        stack={stack}
                        units={units}
                        emitArcs={emitArcs}
                    />
                </div>
            )}
        </aside>
    );
}

function CommittedToolpaths({
    stack,
    editingId,
    tabMode,
    setTabMode,
    setEditingId,
    setStack,
    setSideTab,
    setStatus,
    rebuildEntryTabs,
    confirm,
    showToast,
    tightTopGap = false,
}: Omit<
    ToolpathRailProps,
    | 'loops'
    | 'selected'
    | 'bitmaps'
    | 'units'
    | 'emitArcs'
    | 'gcode'
    | 'fileName'
    | 'machineProfileId'
    | 'machineTravelLimits'
    | 'stock'
    | 'setStock'
    | 'editingEntry'
    | 'setDraftPreview'
    | 'setDraftProgress'
    | 'onResult'
    | 'onUpdate'
    | 'onImportFile'
> & { tightTopGap?: boolean }) {
    return (
        <section
            className={`mx-3 ${tightTopGap ? 'mt-1' : 'mt-3'} mb-3 space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50`}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Job toolpaths{' '}
                    <span className="font-medium normal-case">
                        ({stack.length})
                    </span>
                </h3>
                <button
                    onClick={() => setTabMode((mode) => !mode)}
                    className={`rounded border px-2 py-0.5 text-xs ${tabMode ? 'bg-robin-500 border-robin-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                >
                    {tabMode ? 'Placing tabs…' : 'Add a Tab'}
                </button>
            </div>
            <div className="space-y-1">
                {stack.map((entry) => {
                    const tabs =
                        (entry.args.tabs as PlacedTab[] | undefined) ?? [];
                    const tabEligible = operationUsesTabs(entry.args.operation);
                    return (
                        <div
                            key={entry.id}
                            className="animate-in fade-in slide-in-from-top-2 duration-300 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-robin-900 dark:bg-dark-lighter"
                        >
                            <div className="flex items-center gap-2">
                                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                                    {entry.label}
                                </span>
                                <button
                                    aria-label={`Edit ${entry.label}`}
                                    onClick={() => {
                                        setEditingId(entry.id);
                                        setSideTab('toolpaths');
                                        setStatus(
                                            `Editing ${entry.label} — Save or Cancel.`,
                                        );
                                    }}
                                    className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-robin-400"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    aria-label={`Delete ${entry.label}`}
                                    onClick={() =>
                                        void deleteEntry(
                                            entry,
                                            editingId,
                                            setEditingId,
                                            setStack,
                                            confirm,
                                            showToast,
                                        )
                                    }
                                    className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {tabEligible && (
                                <div className="mt-1 flex items-center gap-1">
                                    <span className="flex-1 text-slate-500 dark:text-slate-400">
                                        {tabs.length
                                            ? `${tabs.length} tab${tabs.length === 1 ? '' : 's'}`
                                            : 'No tabs'}
                                    </span>
                                    <button
                                        onClick={() =>
                                            rebuildEntryTabs(
                                                entry.id,
                                                defaultTabsForContours(
                                                    entry.preview.map(
                                                        (preview) =>
                                                            preview.points,
                                                    ),
                                                ),
                                            )
                                        }
                                        className="rounded border border-slate-300 dark:border-robin-900 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark"
                                    >
                                        Auto Tabs
                                    </button>
                                    <span
                                        className="inline-flex"
                                        title={
                                            tabs.length
                                                ? undefined
                                                : 'There are no tabs to remove from this toolpath.'
                                        }
                                    >
                                        <button
                                            disabled={tabs.length === 0}
                                            aria-describedby={
                                                tabs.length === 0
                                                    ? `clear-tabs-hint-${entry.id}`
                                                    : undefined
                                            }
                                            onClick={() =>
                                                void clearTabs(
                                                    entry,
                                                    tabs.length,
                                                    rebuildEntryTabs,
                                                    confirm,
                                                )
                                            }
                                            className="rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-robin-900 dark:text-slate-300 dark:disabled:hover:bg-transparent"
                                        >
                                            Clear Tabs
                                        </button>
                                        {tabs.length === 0 && (
                                            <span
                                                id={`clear-tabs-hint-${entry.id}`}
                                                className="sr-only"
                                            >
                                                There are no tabs to remove from
                                                this toolpath.
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
                {!stack.length && (
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                            Ready to make your first toolpath?
                        </div>
                        <p>
                            Click a shape on the canvas, or drag a box around
                            several shapes. Then choose a cut type here.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

async function deleteEntry(
    entry: ToolpathStackEntry,
    editingId: string | null,
    setEditingId: Dispatch<SetStateAction<string | null>>,
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>,
    confirm: ToolpathRailProps['confirm'],
    showToast: ToolpathRailProps['showToast'],
) {
    const ok = await confirm({
        title: 'Delete toolpath?',
        message: `Delete ${entry.label}? You can undo this with Ctrl+Z.`,
        confirmLabel: 'Delete toolpath',
        destructive: true,
    });
    if (!ok) return;
    if (editingId === entry.id) setEditingId(null);
    setStack((current) => current.filter((item) => item.id !== entry.id));
    showToast('Toolpath deleted. Press Ctrl+Z to restore it.', 'info', 4200);
}

async function clearTabs(
    entry: ToolpathStackEntry,
    count: number,
    rebuildEntryTabs: ToolpathRailProps['rebuildEntryTabs'],
    confirm: ToolpathRailProps['confirm'],
) {
    const ok = await confirm({
        title: 'Clear tabs?',
        message: `Remove all ${count} tab${count === 1 ? '' : 's'} from ${entry.label}?`,
        confirmLabel: 'Clear tabs',
        destructive: true,
    });
    if (ok) rebuildEntryTabs(entry.id, []);
}
