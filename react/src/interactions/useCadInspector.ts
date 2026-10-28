/**
 * Purpose: React hook that owns the CadInspector workflow.
 */
import { useState } from 'react';
import { useInspectorVisibility } from './useInspectorVisibility';
import type {
    ComponentProps,
    Dispatch,
    MutableRefObject,
    SetStateAction,
} from 'react';
import type { ViewLoop } from '../canvas/types';
import { CadInspector } from '../components/CadInspector';
import type { InspectorPatch } from '../components/CadInspector';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import type { TransformMode } from '../lib/transform';
import type { UnitSystem } from '../lib/units';

interface CadInspectorOptions {
    selected: string[];
    selectedLoops: () => ViewLoop[];
    transformMode: TransformMode | null;
    orientRef: MutableRefObject<{ key: string; angle: number }>;
    newLoopId: () => string;
    pushHistory: () => void;
    refreshBounds: (loops: ViewLoop[]) => void;
    setLoops: Dispatch<SetStateAction<ViewLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setStatus: Dispatch<SetStateAction<string>>;
    // Retain the bitmap type in the module boundary: inspector commands share
    // the document contract with transform/corner commands.
    _bitmapContract?: PlacedBitmapRecord;
}

/** Coordinates selection-driven CAD inspector visibility and live previews. */
export function useCadInspector({
    selected,
    selectedLoops,
    transformMode,
    orientRef,
    newLoopId,
    pushHistory,
    refreshBounds,
    setLoops,
    setSelected,
    setStack,
    setDraftPreview,
    setStatus,
}: CadInspectorOptions) {
    const [preview, setPreview] = useState<{
        id: string;
        points: { x: number; y: number }[];
    } | null>(null);
    const inspectorLoop =
        selected.length === 1 ? (selectedLoops()[0] ?? null) : null;
    const eligible =
        inspectorLoop !== null &&
        Array.isArray(inspectorLoop.points) &&
        inspectorLoop.points.length > 0 &&
        !inspectorLoop.bitmapId;
    const visibility = useInspectorVisibility(
        eligible ? inspectorLoop.id : null,
    );
    const { buildInspectorPreview, handleInspectorApply } =
        useInspectorCommands({
            inspectorLoop,
            orientRef,
            newLoopId,
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setDraftPreview,
            setInspectorPreview: setPreview,
            setStatus,
        });

    const inspector: ComponentProps<typeof CadInspector> | null =
        visibility.visible && inspectorLoop && transformMode === null
            ? {
                  loop: inspectorLoop,
                  angle: Math.round(orientRef.current.angle * 10) / 10,
                  onApply: handleInspectorApply,
                  onPreview: (patch: InspectorPatch | null) =>
                      setPreview(patch ? buildInspectorPreview(patch) : null),
                  units: 'mm' as UnitSystem,
                  onClose: () => {
                      setPreview(null);
                      visibility.close();
                  },
              }
            : null;

    return {
        inspectorPreview: preview,
        inspector: (units: ComponentProps<typeof CadInspector>['units']) =>
            inspector ? { ...inspector, units } : null,
        canShowProperties: eligible && !visibility.visible,
        show: visibility.open,
    };
}

import { useInspectorCommands } from './useInspectorCommands';
