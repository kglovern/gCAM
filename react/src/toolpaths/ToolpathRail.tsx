import { linkedMaskExportError } from '../lib/image-mask';
import type { FlattenImageCommit } from '../lib/flatten-image-document';
import { LaserBulkSettings } from './LaserBulkSettings';
import { mergeRebuiltLaserOperations } from './rebuild-laser-operations';
import { LayerPanel, type LayerPanelProps } from '../layers/LayerPanel';
/**
 * Purpose: Implementation module for ToolpathRail in the react domain.
 */
import { ArrowUp, ArrowDown, FileUp, Pencil, Trash2, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    duplicateLaserOperations,
    moveLaserOperations,
    setLaserOutputs,
} from './laser-bulk-operations';
import { useStableCallback } from '../lib/useStableCallback';
import type { Dispatch, SetStateAction } from 'react';
import { ToolpathPanel } from './ToolpathPanel';
import type { ToolpathStackEntry } from './useToolpathStack';
import type { ViewLoop } from '../canvas/types';
import type { PlacedTab, ProfileArgs, ToolpathResult } from '../lib/engine';
import { defaultTabsForContours, operationUsesTabs } from '../lib/tabs';
import type { UnitSystem } from '../lib/units';
import { displayValue, lengthUnit } from '../lib/units';
import type { JobStock } from '../job/stock';
import type { MachineTravelLimits } from '../cutting-parameters/types';
import { JobStockSetup } from '../job/JobStockSetup';
import { machineProfileById } from '../cutting-parameters/machines';
import { GcodeExportButton } from './GcodeExportButton';
import type { OutputSettings } from '../gcode/profiles';

type Bitmap = {
    maskSourceIds?: string[];
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    img?: HTMLImageElement;
    rotation?: number;
};

interface ToolpathRailProps {
    onMaskLink?: (id: string, ids?: string[]) => void;
    onFlattenImage?: (value: FlattenImageCommit) => void;
    workspace?: 'milling' | 'laser';
    outputSettings?: OutputSettings;
    gcodeError?: string;
    gcodeBusy?: boolean;
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
    setSideTab: (tab: 'toolpaths' | 'preview') => void;
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
    workspace,
    outputSettings,
    gcodeError,
    gcodeBusy,
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
    onFlattenImage,
    onMaskLink,
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
    const [bulkBusy, setBulkBusy] = useState(false);
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
                          ...(loop.groupId !== undefined
                              ? { groupId: loop.groupId }
                              : {}),
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
                {showJobStock ? (
                    <JobStockSetup
                        laser={workspace === 'laser'}
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
                ) : (
                    <details className="mx-3 mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-robin-900">
                        <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                            Job stock · {displayValue(stock.widthMm, units)} ×{' '}
                            {displayValue(stock.heightMm, units)} ×{' '}
                            {displayValue(stock.thicknessMm, units)}{' '}
                            {lengthUnit(units)} · Edit
                        </summary>
                        <JobStockSetup
                            laser={workspace === 'laser'}
                            embedded
                            stock={stock}
                            units={units}
                            onChange={setStock}
                            maxXTravelMm={machineTravelLimits.maxXTravelMm}
                            maxYTravelMm={machineTravelLimits.maxYTravelMm}
                            machineName={
                                machineProfileById(machineProfileId)
                                    ?.displayName ?? 'Custom machine'
                            }
                        />
                    </details>
                )}
                {layerPanel && <LayerPanel {...layerPanel} />}
                {workspace === 'laser' && (
                    <section
                        className="mx-3 mt-2 rounded-lg border border-slate-200 p-2 dark:border-robin-900"
                        aria-label="Laser artwork"
                    >
                        <button
                            type="button"
                            onClick={onImportFile}
                            className="flex w-full items-center justify-center gap-2 rounded bg-robin-500 px-3 py-2 text-sm font-medium text-white"
                        >
                            <FileUp size={16} />
                            Open image or artwork
                        </button>
                        {!showEditor && (
                            <p className="mt-2 text-xs text-slate-500">
                                Images: raster engraving. Shapes: line cuts or
                                filled engraving.
                            </p>
                        )}
                    </section>
                )}
                {emptyWorkspace && workspace !== 'laser' && (
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
                        workspace={workspace}
                        onMaskLink={
                            workspace === 'laser' ? onMaskLink : undefined
                        }
                        onFlattenImage={
                            workspace === 'laser' ? onFlattenImage : undefined
                        }
                        onFitSurface={onFitSurface ? panelFit : undefined}
                        onStockThickness={panelThickness}
                        loops={loops}
                        selected={selected}
                        bitmaps={bitmaps}
                        laserSettingsSources={
                            workspace === 'laser' ? stack : undefined
                        }
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
                            bulkBusy={bulkBusy}
                            onBulkBusy={setBulkBusy}
                            bitmaps={bitmaps}
                            units={units}
                            machineProfileId={machineProfileId}
                            workspace={workspace}
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
                    {gcodeBusy && (
                        <p role="status" className="text-xs text-slate-500">
                            Preparing G-code…
                        </p>
                    )}
                    {gcodeError && (
                        <p
                            role="alert"
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {gcodeError}
                        </p>
                    )}
                    <fieldset disabled={bulkBusy}>
                        <GcodeExportButton
                            validateEntry={(entry) =>
                                !stack.includes(entry) ||
                                entry.outputEnabled === false
                                    ? 'Toolpath changed. Export the current version.'
                                    : linkedMaskExportError(
                                          [entry],
                                          loops,
                                          bitmaps,
                                      )
                            }
                            outputSettings={outputSettings}
                            laserRotary={
                                workspace === 'laser'
                                    ? stock.laserRotary
                                    : undefined
                            }
                            gcode={gcode}
                            fileName={fileName}
                            stack={stack}
                            units={units}
                            emitArcs={emitArcs}
                        />
                    </fieldset>
                </div>
            )}
        </aside>
    );
}

function CommittedToolpaths({
    bulkBusy,
    onBulkBusy,
    bitmaps,
    units,
    machineProfileId,
    workspace,
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
    | 'emitArcs'
    | 'gcode'
    | 'fileName'
    | 'machineTravelLimits'
    | 'stock'
    | 'setStock'
    | 'editingEntry'
    | 'setDraftPreview'
    | 'setDraftProgress'
    | 'onResult'
    | 'onUpdate'
    | 'onImportFile'
> & {
    tightTopGap?: boolean;
    bulkBusy: boolean;
    onBulkBusy: (busy: boolean) => void;
}) {
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkIds, setBulkIds] = useState<string[]>([]);
    const ids = new Set(bulkIds);
    const selectedEntries = stack.filter(
        (entry) =>
            ids.has(entry.id) && entry.args.operation.startsWith('laser-'),
    );
    const selectedIds = selectedEntries.map((entry) => entry.id);
    const canMove = (direction: -1 | 1) =>
        moveLaserOperations(stack, selectedIds, direction).some(
            (entry, index) => entry !== stack[index],
        );
    const bulkButton =
        'rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-robin-900';
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
                {stack.length > 0 && (
                    <button
                        type="button"
                        aria-label="Preview toolpaths"
                        onClick={() => setSideTab('preview')}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-robin-900"
                    >
                        Preview
                    </button>
                )}
                {workspace === 'laser' && stack.length > 0 && (
                    <button
                        type="button"
                        aria-label="Select laser operations"
                        disabled={bulkBusy}
                        aria-pressed={bulkMode}
                        className={bulkButton}
                        onClick={() => {
                            setBulkMode(!bulkMode);
                            setBulkIds([]);
                        }}
                    >
                        {bulkMode ? 'Done' : 'Select'}
                    </button>
                )}
                {stack.some((entry) =>
                    operationUsesTabs(entry.args.operation),
                ) && (
                    <button
                        onClick={() => setTabMode((mode) => !mode)}
                        className={`rounded border px-2 py-0.5 text-xs ${tabMode ? 'bg-robin-500 border-robin-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                    >
                        {tabMode
                            ? workspace === 'laser'
                                ? 'Placing bridges…'
                                : 'Placing tabs…'
                            : workspace === 'laser'
                              ? 'Add a Bridge'
                              : 'Add a Tab'}
                    </button>
                )}
            </div>
            {workspace === 'laser' && bulkMode && (
                <div
                    className="space-y-2 rounded border border-slate-200 p-2 dark:border-robin-900"
                    aria-label="Selected laser operations"
                >
                    <fieldset disabled={bulkBusy}>
                        <div className="flex items-center justify-between text-xs">
                            <label className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    aria-label="Select all laser operations"
                                    checked={
                                        stack.length > 0 &&
                                        selectedEntries.length === stack.length
                                    }
                                    onChange={(e) =>
                                        setBulkIds(
                                            e.target.checked
                                                ? stack.map((entry) => entry.id)
                                                : [],
                                        )
                                    }
                                />
                                All
                            </label>
                            <span>{selectedEntries.length} selected</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={
                                    !selectedEntries.some(
                                        (entry) =>
                                            entry.outputEnabled === false,
                                    )
                                }
                                onClick={() =>
                                    setStack((current) =>
                                        setLaserOutputs(
                                            current,
                                            selectedIds,
                                            true,
                                        ),
                                    )
                                }
                            >
                                Enable selected
                            </button>
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={
                                    !selectedEntries.some(
                                        (entry) =>
                                            entry.outputEnabled !== false,
                                    )
                                }
                                onClick={() =>
                                    setStack((current) =>
                                        setLaserOutputs(
                                            current,
                                            selectedIds,
                                            false,
                                        ),
                                    )
                                }
                            >
                                Disable selected
                            </button>
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={!selectedEntries.length}
                                onClick={() =>
                                    setStack((current) =>
                                        duplicateLaserOperations(
                                            current,
                                            selectedIds,
                                        ),
                                    )
                                }
                            >
                                Duplicate selected
                            </button>
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={!canMove(-1)}
                                onClick={() =>
                                    setStack((current) =>
                                        moveLaserOperations(
                                            current,
                                            selectedIds,
                                            -1,
                                        ),
                                    )
                                }
                            >
                                Move selected earlier
                            </button>
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={!canMove(1)}
                                onClick={() =>
                                    setStack((current) =>
                                        moveLaserOperations(
                                            current,
                                            selectedIds,
                                            1,
                                        ),
                                    )
                                }
                            >
                                Move selected later
                            </button>
                            <button
                                type="button"
                                className={bulkButton}
                                disabled={!selectedEntries.length}
                                onClick={async () => {
                                    if (
                                        !(await confirm({
                                            title: 'Delete selected operations?',
                                            message: `Remove ${selectedEntries.length} toolpaths? Artwork stays in the project.`,
                                            confirmLabel: 'Delete',
                                            destructive: true,
                                        }))
                                    )
                                        return;
                                    const remove = new Set(selectedIds);
                                    setStack((current) =>
                                        current.filter(
                                            (entry) => !remove.has(entry.id),
                                        ),
                                    );
                                    setBulkIds([]);
                                    setStatus('Selected operations deleted.');
                                }}
                            >
                                Delete selected
                            </button>
                        </div>
                    </fieldset>
                    <LaserBulkSettings
                        stack={stack}
                        entries={selectedEntries}
                        bitmaps={bitmaps}
                        units={units}
                        maxFeed={
                            machineProfileById(machineProfileId)?.maxXYFeedMmMin
                        }
                        busy={bulkBusy}
                        onBusy={onBulkBusy}
                        onCommit={(before, replacements) =>
                            setStack((current) =>
                                mergeRebuiltLaserOperations(
                                    current,
                                    before,
                                    replacements,
                                ),
                            )
                        }
                    />
                </div>
            )}
            <fieldset disabled={bulkBusy} className="min-w-0 space-y-1">
                {stack.map((entry, index) => {
                    const tabs =
                        (entry.args.tabs as PlacedTab[] | undefined) ?? [];
                    const tabEligible = operationUsesTabs(entry.args.operation);
                    return (
                        <div
                            key={entry.id}
                            className="animate-in fade-in slide-in-from-top-2 duration-300 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-robin-900 dark:bg-dark-lighter"
                        >
                            <div className="flex items-center gap-2">
                                {workspace === 'laser' ? (
                                    <>
                                        {bulkMode ? (
                                            <>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select operation ${entry.label}`}
                                                    checked={ids.has(entry.id)}
                                                    onChange={(e) =>
                                                        setBulkIds((current) =>
                                                            e.target.checked
                                                                ? [
                                                                      ...current.filter(
                                                                          (
                                                                              id,
                                                                          ) =>
                                                                              id !==
                                                                              entry.id,
                                                                      ),
                                                                      entry.id,
                                                                  ]
                                                                : current.filter(
                                                                      (id) =>
                                                                          id !==
                                                                          entry.id,
                                                                  ),
                                                        )
                                                    }
                                                />
                                                {entry.outputEnabled ===
                                                    false && (
                                                    <span className="text-slate-500">
                                                        Off
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Output ${entry.label}`}
                                                    checked={
                                                        entry.outputEnabled !==
                                                        false
                                                    }
                                                    onChange={(e) => {
                                                        const enabled =
                                                            e.target.checked;
                                                        setStack((current) =>
                                                            current.map((p) =>
                                                                p.id ===
                                                                entry.id
                                                                    ? {
                                                                          ...p,
                                                                          outputEnabled:
                                                                              enabled,
                                                                      }
                                                                    : p,
                                                            ),
                                                        );
                                                    }}
                                                />
                                            </>
                                        )}
                                        <input
                                            key={entry.label}
                                            aria-label={`Name ${entry.label}`}
                                            defaultValue={entry.label}
                                            maxLength={80}
                                            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-slate-700 focus:border-robin-400 dark:text-slate-200"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape')
                                                    e.currentTarget.value =
                                                        entry.label;
                                                if (
                                                    e.key === 'Enter' ||
                                                    e.key === 'Escape'
                                                )
                                                    e.currentTarget.blur();
                                            }}
                                            onBlur={(e) => {
                                                const label =
                                                    e.target.value
                                                        .replace(
                                                            /[()\r\n]/g,
                                                            '',
                                                        )
                                                        .trim() || entry.label;
                                                e.target.value = label;
                                                if (label !== entry.label)
                                                    setStack((current) =>
                                                        current.map((p) =>
                                                            p.id === entry.id
                                                                ? {
                                                                      ...p,
                                                                      label,
                                                                      customLabel:
                                                                          label,
                                                                      toolpath:
                                                                          {
                                                                              ...p.toolpath,
                                                                              label,
                                                                          },
                                                                  }
                                                                : p,
                                                        ),
                                                    );
                                            }}
                                        />
                                        <button
                                            type="button"
                                            aria-label={`Duplicate ${entry.label}`}
                                            className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-robin-400"
                                            onClick={() =>
                                                setStack((current) =>
                                                    duplicateLaserOperations(
                                                        current,
                                                        [entry.id],
                                                    ),
                                                )
                                            }
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                                        {entry.label}
                                    </span>
                                )}
                                {workspace === 'laser' &&
                                    [-1, 1].map((direction) => (
                                        <button
                                            key={direction}
                                            type="button"
                                            aria-label={`Move ${entry.label} ${direction < 0 ? 'earlier' : 'later'}`}
                                            disabled={
                                                index + direction < 0 ||
                                                index + direction >=
                                                    stack.length
                                            }
                                            onClick={() =>
                                                setStack((current) =>
                                                    moveLaserOperations(
                                                        current,
                                                        [entry.id],
                                                        direction as -1 | 1,
                                                    ),
                                                )
                                            }
                                            className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-robin-400 disabled:opacity-25"
                                        >
                                            {direction < 0 ? (
                                                <ArrowUp size={14} />
                                            ) : (
                                                <ArrowDown size={14} />
                                            )}
                                        </button>
                                    ))}
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
                                            ? `${tabs.length} ${workspace === 'laser' ? 'bridge' : 'tab'}${tabs.length === 1 ? '' : 's'}`
                                            : workspace === 'laser'
                                              ? 'No manual bridges'
                                              : 'No tabs'}
                                    </span>
                                    <button
                                        onClick={() =>
                                            rebuildEntryTabs(
                                                entry.id,
                                                entry.args.operation ===
                                                    'laser-cut'
                                                    ? entry.preview.flatMap(
                                                          (
                                                              preview,
                                                              contourIndex,
                                                          ) => {
                                                              const p =
                                                                  preview.points;
                                                              return p.length >
                                                                  3 &&
                                                                  Math.hypot(
                                                                      p[0].x -
                                                                          p[
                                                                              p.length -
                                                                                  1
                                                                          ].x,
                                                                      p[0].y -
                                                                          p[
                                                                              p.length -
                                                                                  1
                                                                          ].y,
                                                                  ) < 1e-7
                                                                  ? defaultTabsForContours(
                                                                        [p],
                                                                    ).map(
                                                                        (
                                                                            tab,
                                                                        ) => ({
                                                                            ...tab,
                                                                            contourIndex,
                                                                        }),
                                                                    )
                                                                  : [];
                                                          },
                                                      )
                                                    : defaultTabsForContours(
                                                          entry.preview.map(
                                                              (preview) =>
                                                                  preview.points,
                                                          ),
                                                      ),
                                            )
                                        }
                                        className="rounded border border-slate-300 dark:border-robin-900 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark"
                                    >
                                        {workspace === 'laser'
                                            ? 'Auto Bridges'
                                            : 'Auto Tabs'}
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
                                            {workspace === 'laser'
                                                ? 'Clear Bridges'
                                                : 'Clear Tabs'}
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
            </fieldset>
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
    const noun = entry.args.operation === 'laser-cut' ? 'bridges' : 'tabs';
    const ok = await confirm({
        title: `Clear ${noun}?`,
        message: `Remove all ${count} ${noun} from ${entry.label}?`,
        confirmLabel: `Clear ${noun}`,
        destructive: true,
    });
    if (ok) rebuildEntryTabs(entry.id, []);
}
