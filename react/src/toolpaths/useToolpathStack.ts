import { pointAtDistance } from '../geometry/primitives.js';
/**
 * Purpose: React hook that owns the ToolpathStack workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import {
    buildToolpathGcode,
    type PlacedTab,
    type ProfileArgs,
    type ToolpathResult,
} from '../lib/engine';
import { createDocumentId } from '../lib/ids';
import { defaultTabsForContours, operationUsesTabs } from '../lib/tabs';

export interface ToolpathStackEntry {
    id: string;
    label: string;
    customLabel?: string;
    outputEnabled?: boolean;
    args: ProfileArgs;
    preview: {
        points: { x: number; y: number }[];
        intensity?: number;
        laserPower?: number;
        variableLaserPower?: boolean;
    }[];
    toolpath: Record<string, unknown>;
}

type DraftPreviewSetter = Dispatch<
    SetStateAction<{ x: number; y: number }[][]>
>;
type DraftProgressSetter = Dispatch<
    SetStateAction<{ percent: number; label: string } | null>
>;

interface ToolpathStackOptions {
    stack: ToolpathStackEntry[];
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    pushHistory: () => void;
    setStatus: Dispatch<SetStateAction<string>>;
    setDraftPreview: DraftPreviewSetter;
    setDraftProgress: DraftProgressSetter;
    setEditingId: Dispatch<SetStateAction<string | null>>;
    showToast(message: string, tone: 'success', duration: number): void;
}

function withoutBitmap(args: ProfileArgs): ProfileArgs {
    const { bitmap, ...persisted } = args as ProfileArgs & { bitmap?: unknown };
    void bitmap;
    return persisted;
}

export function previewFor(result: ToolpathResult) {
    return [
        ...result.previewContours,
        ...(result.trochoidPreviewContours ?? []),
    ].map((points) => ({
        points,
        variableLaserPower: (
            points as typeof points & { _laserVariablePower?: boolean }
        )._laserVariablePower,
        laserPower: (points as typeof points & { _laserPower?: number })
            ._laserPower,
        intensity:
            Number(
                (
                    points as typeof points & {
                        _intensity?: number;
                    }
                )._intensity,
            ) || undefined,
    }));
}

/**
 * Owns committed toolpath-stack mutations. Form and canvas components only
 * request an operation; this boundary normalizes persisted results and tab
 * rebuilds consistently.
 */
export function useToolpathStack(options: ToolpathStackOptions) {
    const commitPair = (
        result: ToolpathResult,
        args: ProfileArgs,
        editingId?: string,
    ) => {
        if (!result.clearing) return false;
        const clearing = result.clearing;
        options.pushHistory();
        options.setStack((current) => {
            const belongs = (entry: ToolpathStackEntry) =>
                entry.id === editingId ||
                Boolean(
                    args.vCarvePairId &&
                        entry.args.vCarvePairId === args.vCarvePairId,
                );
            const old = current.filter(belongs);
            const first = current.findIndex(belongs);
            const make = (
                r: ToolpathResult,
                a: ProfileArgs,
                operation: string,
            ): ToolpathStackEntry => {
                const previous = old.find(
                    (e) => e.args.operation === operation,
                );
                return {
                    id: previous?.id ?? createDocumentId('toolpath'),
                    customLabel: previous?.customLabel,
                    outputEnabled: previous?.outputEnabled,
                    label: previous?.customLabel ?? r.label,
                    args: withoutBitmap(a),
                    preview: previewFor(r),
                    toolpath: r.toolpath,
                };
            };
            const pair = [
                make(clearing.result, clearing.args, 'pocket'),
                make(result, args, 'vcarve'),
            ];
            const rest = current.filter((e) => !belongs(e));
            rest.splice(first < 0 ? rest.length : first, 0, ...pair);
            return rest;
        });
        options.setSelected([]);
        options.setEditingId(null);
        options.setDraftPreview([]);
        options.setDraftProgress(null);
        options.setStatus('V-carve clearing and finishing toolpaths saved.');
        return true;
    };
    const clearDraft = () => {
        options.setDraftPreview([]);
        options.setDraftProgress(null);
    };

    const handleResult = (result: ToolpathResult, args: ProfileArgs) => {
        if (commitPair(result, args)) return;
        options.pushHistory();
        const persisted = withoutBitmap(args);
        const finish = (
            label: string,
            previewContours: { x: number; y: number }[][],
            toolpath: Record<string, unknown>,
            tabs: PlacedTab[],
        ) => {
            options.setStack((current) => {
                options.setStatus(
                    `${label} added (${current.length + 1} toolpaths).`,
                );
                return [
                    ...current,
                    {
                        id: createDocumentId('toolpath'),
                        label,
                        args: { ...persisted, tabs },
                        preview: previewFor({
                            ...result,
                            label,
                            previewContours,
                            toolpath,
                        }),
                        toolpath,
                    },
                ];
            });
            options.setSelected([]);
            options.setEditingId(null);
            clearDraft();
            options.showToast(
                'Toolpath added. Use Ctrl+Z to undo.',
                'success',
                2200,
            );
        };

        if (
            operationUsesTabs(args.operation) &&
            args.tabHeight !== 0 &&
            !(args.tabs as PlacedTab[] | undefined)?.length
        ) {
            const defaults = defaultTabsForContours(result.previewContours);
            if (!defaults.length) {
                finish(
                    result.label,
                    result.previewContours,
                    result.toolpath,
                    [],
                );
                return;
            }
            options.setStatus('Adding automatic tabs…');
            void buildToolpathGcode({ ...persisted, tabs: defaults }).then(
                (withTabs) =>
                    finish(
                        withTabs.label,
                        withTabs.previewContours,
                        withTabs.toolpath,
                        defaults,
                    ),
                () =>
                    finish(
                        result.label,
                        result.previewContours,
                        result.toolpath,
                        [],
                    ),
            );
            return;
        }
        finish(result.label, result.previewContours, result.toolpath, []);
    };

    const handleUpdateResult = (
        id: string,
        result: ToolpathResult,
        args: ProfileArgs,
    ) => {
        if (commitPair(result, args, id)) return;
        options.pushHistory();
        const persisted = withoutBitmap(args);
        options.setStack((current) =>
            current
                .filter(
                    (entry) =>
                        !(
                            args.operation === 'vcarve' &&
                            !args.vCarveClearingTool &&
                            args.vCarvePairId &&
                            entry.args.vCarvePairId === args.vCarvePairId &&
                            entry.args.operation === 'pocket'
                        ),
                )
                .map((entry) =>
                    entry.id === id
                        ? {
                              ...entry,
                              args: {
                                  ...persisted,
                                  ...(args.operation === 'laser-cut'
                                      ? {
                                            tabs:
                                                (result.toolpath
                                                    .laserManualTabs as
                                                    | PlacedTab[]
                                                    | undefined) ?? [],
                                        }
                                      : {}),
                              },
                              label: entry.customLabel ?? result.label,
                              preview: previewFor(result),
                              toolpath: {
                                  ...result.toolpath,
                                  label: entry.customLabel ?? result.label,
                              },
                          }
                        : args.vCarveInset &&
                            args.vCarvePairId &&
                            entry.args.vCarvePairId === args.vCarvePairId &&
                            entry.args.operation === 'vcarve'
                          ? {
                                ...entry,
                                args: {
                                    ...entry.args,
                                    vCarveClearingTool: {
                                        toolDiameter: args.toolDiameter,
                                        toolNumber: args.toolNumber,
                                        feedRate: args.feedRate,
                                        plungeRate: args.plungeRate,
                                        spindle: args.spindle,
                                        passDepth: args.passDepth,
                                        libraryToolId: args.libraryToolId,
                                        libraryToolName: args.libraryToolName,
                                    },
                                },
                            }
                          : entry,
                ),
        );
        options.setEditingId(null);
        clearDraft();
        options.setStatus(`${result.label} updated.`);
    };

    const rebuildEntryTabs = (entryId: string, tabs: PlacedTab[]) => {
        const entry = options.stack.find(
            (candidate) => candidate.id === entryId,
        );
        if (!entry) return;
        if (entry.args.operation === 'laser-cut') {
            tabs = tabs.map((tab) => ({
                ...tab,
                anchor:
                    pointAtDistance(
                        entry.preview[tab.contourIndex]?.points ?? [],
                        tab.along,
                    ) ?? undefined,
            }));
        }
        options.setStatus(
            entry.args.operation === 'laser-cut'
                ? 'Updating bridges…'
                : 'Updating tabs…',
        );
        options.pushHistory();
        const args = {
            ...entry.args,
            tabs,
            ...(entry.args.operation === 'laser-cut' && tabs.length
                ? {
                      laserOptions: {
                          ...entry.args.laserOptions,
                          bridges: true,
                          bridgeMode: 'manual' as const,
                      },
                  }
                : {}),
        };
        void buildToolpathGcode(args).then(
            (result) => {
                options.setStack((current) =>
                    current.map((candidate) =>
                        candidate.id === entryId
                            ? {
                                  ...candidate,
                                  args: {
                                      ...args,
                                      tabs:
                                          (result.toolpath.laserManualTabs as
                                              | PlacedTab[]
                                              | undefined) ?? tabs,
                                  },
                                  label: result.label,
                                  preview: previewFor(result),
                                  toolpath: result.toolpath,
                              }
                            : candidate,
                    ),
                );
                options.setStatus(
                    tabs.length
                        ? `Tabs updated (${tabs.length} on ${entry.label}).`
                        : `Tabs cleared on ${entry.label}.`,
                );
            },
            (error) =>
                options.setStatus(
                    error instanceof Error
                        ? error.message
                        : 'Could not update tabs',
                ),
        );
    };

    const handlePlaceTab = (
        entryId: string,
        contourIndex: number,
        along: number,
    ) => {
        const entry = options.stack.find(
            (candidate) => candidate.id === entryId,
        );
        if (!entry) return;
        if (!operationUsesTabs(entry.args.operation)) {
            options.setStatus('Tabs are for profile and laser-cut paths.');
            return;
        }
        rebuildEntryTabs(entryId, [
            ...((entry.args.tabs as PlacedTab[] | undefined) ?? []),
            { contourIndex, along },
        ]);
    };

    const handleMoveTab = (
        entryId: string,
        tabIndex: number,
        along: number,
    ) => {
        const entry = options.stack.find(
            (candidate) => candidate.id === entryId,
        );
        if (!entry) return;
        const tabs = [...((entry.args.tabs as PlacedTab[] | undefined) ?? [])];
        if (!tabs[tabIndex]) return;
        tabs[tabIndex] = { ...tabs[tabIndex], along };
        rebuildEntryTabs(entryId, tabs);
    };

    const handleDeleteTab = (entryId: string, tabIndex: number) => {
        const entry = options.stack.find(
            (candidate) => candidate.id === entryId,
        );
        if (!entry) return;
        const tabs = [...((entry.args.tabs as PlacedTab[] | undefined) ?? [])];
        if (!tabs[tabIndex]) return;
        tabs.splice(tabIndex, 1);
        rebuildEntryTabs(entryId, tabs);
    };

    return {
        handleResult,
        handleUpdateResult,
        rebuildEntryTabs,
        handlePlaceTab,
        handleMoveTab,
        handleDeleteTab,
    };
}
