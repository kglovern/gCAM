/**
 * Purpose: React hook that owns the ToolpathPresentation workflow.
 */
import { useMemo } from 'react';
import { pointAtDistance } from '../geometry/primitives.js';
import type { PlacedTab } from '../lib/engine';
import type { UnitSystem } from '../lib/units';
import { operationUsesTabs } from '../lib/tabs';
import type { ToolpathStackEntry } from './useToolpathStack';
import { exportToolpaths } from '../gcode/exportToolpaths';
import {
    DEFAULT_OUTPUT,
    outputError,
    type OutputSettings,
} from '../gcode/profiles';

interface ToolpathPresentationOptions {
    outputSettings?: OutputSettings;
    stack: ToolpathStackEntry[];
    editingId: string | null;
    fileName: string;
    emitArcs: boolean;
    units: UnitSystem;
}

/** Stable derived presentation data for canvas and preview panels. */
export function useToolpathPresentation(options: ToolpathPresentationOptions) {
    const editingEntry =
        options.editingId === null
            ? null
            : (options.stack.find((entry) => entry.id === options.editingId) ??
              null);
    const preview = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                Array.isArray(entry.preview)
                    ? entry.preview.map((loop) => ({
                          ...loop,
                          entryId: entry.id,
                          tabEligible: operationUsesTabs(entry.args.operation),
                          tabWidth: Number(entry.args.tabWidth) || 9,
                          toolDiameter: Number(entry.args.toolDiameter) || 6,
                      }))
                    : [],
            ),
        [options.stack],
    );
    const tabMarkers = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                ((entry.args.tabs as PlacedTab[] | undefined) ?? []).flatMap(
                    (tab, tabIndex) => {
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
                        let previewIndex = -1;
                        let seen = 0;
                        for (const other of options.stack) {
                            for (
                                let index = 0;
                                index < other.preview.length;
                                index += 1
                            ) {
                                if (
                                    other.id === entry.id &&
                                    index === tab.contourIndex
                                ) {
                                    previewIndex = seen;
                                    break;
                                }
                                seen += 1;
                            }
                            if (previewIndex >= 0) break;
                        }
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
        [options.stack],
    );
    const { gcode, gcodeError } = useMemo(() => {
        try {
            return {
                gcode: exportToolpaths(
                    options.stack.map((entry) => entry.toolpath),
                    options.fileName || 'gcam',
                    options.emitArcs,
                    options.units,
                    options.outputSettings ?? DEFAULT_OUTPUT,
                ),
                gcodeError: '',
            };
        } catch (error) {
            return { gcode: '', gcodeError: outputError(error) };
        }
    }, [
        options.stack,
        options.fileName,
        options.emitArcs,
        options.units,
        options.outputSettings,
    ]);
    const previewToolpaths = useMemo(
        () =>
            options.stack.map((entry) => ({
                ...entry.toolpath,
                cutterType: entry.args.cutterType ?? 'flat',
                cutterAngle: entry.args.cutterAngle,
            })),
        [options.stack],
    );

    return {
        editingEntry,
        preview,
        tabMarkers,
        gcode,
        gcodeError,
        previewToolpaths,
    };
}
