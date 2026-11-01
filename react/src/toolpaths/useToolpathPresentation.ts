import { linkedMaskExportError } from '../lib/image-mask';
import { pocketPreviewRegion } from '../canvas/pocketDepthPreview';
import { useCutDepthPreview } from './useCutDepthPreview';
import type { ViewLoop } from '../canvas/types';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { LaserRotarySetup } from '../cam/laser-rotary.js';
/**
 * Purpose: React hook that owns the ToolpathPresentation workflow.
 */
import { useMemo } from 'react';
import { pointAtDistance } from '../geometry/primitives.js';
import type { PlacedTab } from '../lib/engine';
import type { UnitSystem } from '../lib/units';
import { operationUsesTabs } from '../lib/tabs';
import type { ToolpathStackEntry } from './useToolpathStack';
import { useProgramExport } from '../gcode/useProgramExport';
import { DEFAULT_OUTPUT, type OutputSettings } from '../gcode/profiles';

interface ToolpathPresentationOptions {
    stockThicknessMm?: number;
    maskLoops?: ViewLoop[];
    maskBitmaps?: PlacedBitmapRecord[];
    outputSettings?: OutputSettings;
    stack: ToolpathStackEntry[];
    editingId: string | null;
    fileName: string;
    emitArcs: boolean;
    units: UnitSystem;
    laserRotary?: LaserRotarySetup;
}

/** Stable derived presentation data for canvas and preview panels. */
export function useToolpathPresentation(options: ToolpathPresentationOptions) {
    const depthPreview = useCutDepthPreview(
        options.stack,
        options.editingId,
        options.stockThicknessMm,
    );
    const maskError = useMemo(
        () =>
            options.maskLoops && options.maskBitmaps
                ? linkedMaskExportError(
                      options.stack,
                      options.maskLoops,
                      options.maskBitmaps,
                  )
                : '',
        [options.stack, options.maskLoops, options.maskBitmaps],
    );
    const safeOutput = useMemo(() => (maskError ? [] : null), [maskError]);
    const editingEntry =
        options.editingId === null
            ? null
            : (options.stack.find((entry) => entry.id === options.editingId) ??
              null);
    const preview = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                entry.outputEnabled !== false &&
                Array.isArray(entry.preview) &&
                !(
                    entry.id === options.editingId &&
                    entry.args.operation.startsWith('laser-')
                )
                    ? entry.preview.map((loop, contourIndex) => ({
                          contourIndex,
                          ...loop,
                          entryId: entry.id,
                          ...(contourIndex === 0 &&
                          entry.id !== options.editingId
                              ? {
                                    pocket:
                                        pocketPreviewRegion(
                                            entry.args.operation,
                                            entry.toolpath,
                                        ) ?? undefined,
                                }
                              : {}),
                          tabEligible:
                              operationUsesTabs(entry.args.operation) &&
                              (entry.args.operation !== 'laser-cut' ||
                                  (loop.points.length > 3 &&
                                      Math.hypot(
                                          loop.points[0].x -
                                              loop.points[
                                                  loop.points.length - 1
                                              ].x,
                                          loop.points[0].y -
                                              loop.points[
                                                  loop.points.length - 1
                                              ].y,
                                      ) < 1e-7)),
                          ...(entry.args.operation === 'laser-cut'
                              ? {
                                    tabSpan:
                                        Number(
                                            entry.args.laserOptions
                                                ?.bridgeWidth,
                                        ) || 0.5,
                                }
                              : {}),
                          tabWidth: Number(entry.args.tabWidth) || 9,
                          toolDiameter:
                              entry.args.operation === 'laser-cut'
                                  ? Number(entry.args.laserSpot) || 0.2
                                  : Number(entry.args.toolDiameter) || 6,
                      }))
                    : [],
            ),
        [options.stack, options.editingId],
    );
    const tabMarkers = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                ((entry.args.tabs as PlacedTab[] | undefined) ?? []).flatMap(
                    (tab, tabIndex) => {
                        if (
                            entry.args.operation === 'laser-cut' &&
                            entry.args.laserOptions?.bridgeMode !== undefined &&
                            (!entry.args.laserOptions.bridges ||
                                entry.args.laserOptions.bridgeMode !== 'manual')
                        )
                            return [];
                        const contour = Array.isArray(entry.preview)
                            ? entry.preview[tab.contourIndex]?.points
                            : undefined;
                        if (!Array.isArray(contour) || contour.length < 2) {
                            return [];
                        }
                        const point = pointAtDistance(contour, tab.along);
                        if (
                            !point ||
                            !Number.isFinite(point.x) ||
                            !Number.isFinite(point.y)
                        ) {
                            return [];
                        }
                        const previewIndex = preview.findIndex(
                            (loop) =>
                                loop.entryId === entry.id &&
                                loop.contourIndex === tab.contourIndex,
                        );
                        if (previewIndex < 0) return [];
                        return [
                            {
                                entryId: entry.id,
                                tabIndex,
                                contourIndex: tab.contourIndex,
                                along: tab.along,
                                previewIndex,
                                x: point.x,
                                y: point.y,
                            },
                        ];
                    },
                ),
            ),
        [options.stack, preview],
    );
    const outputToolpaths = useMemo(
        () =>
            options.stack
                .filter((entry) => entry.outputEnabled !== false)
                .map((entry) =>
                    entry.args.operation.startsWith('laser-')
                        ? {
                              ...entry.toolpath,
                              laserRotary: options.laserRotary,
                          }
                        : entry.toolpath,
                ),
        [options.stack, options.laserRotary],
    );
    const { gcode, gcodeError, gcodeBusy } = useProgramExport(
        safeOutput ?? outputToolpaths,
        options.fileName || 'gcam',
        options.emitArcs,
        options.units,
        options.outputSettings ?? DEFAULT_OUTPUT,
    );
    const previewToolpaths = useMemo(
        () =>
            options.stack
                .filter((entry) => entry.outputEnabled !== false)
                .map((entry) => ({
                    ...entry.toolpath,
                    cutterType: entry.args.cutterType ?? 'flat',
                    cutterAngle: entry.args.cutterAngle,
                })),
        [options.stack],
    );

    return {
        editingEntry,
        preview: maskError
            ? []
            : preview.map((p, i) =>
                  i
                      ? p
                      : {
                            ...p,
                            depthImage: depthPreview.image,
                            depthPreviewPending: depthPreview.pending,
                            depthPreviewError: depthPreview.error,
                        },
              ),
        tabMarkers,
        gcode: maskError ? '' : gcode,
        gcodeError: maskError || gcodeError,
        gcodeBusy: maskError ? false : gcodeBusy,
        previewToolpaths: maskError ? [] : previewToolpaths,
    };
}
