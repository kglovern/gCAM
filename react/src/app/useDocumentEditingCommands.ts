/**
 * Purpose: React hook that owns the DocumentEditingCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { ViewLoop } from '../canvas/types';
import { useConfirmation } from '../components/ConfirmDialog';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import { useDocumentWorkspace } from '../document/useDocumentWorkspace';
import { useNewCanvasCommand } from '../document/useNewCanvasCommand';
import { useProjectFileCommands } from '../document/useProjectFileCommands';
import { useDrawCommands } from '../draw/useDrawCommands';
import type { Guide } from '../lib/guides';
import { useSelectionCommands } from '../interactions/useSelectionCommands';
import { useTrimCommands } from '../interactions/useTrimCommands';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import { useDrawingWorkspaceState } from './useDrawingWorkspaceState';
import { useTransformWorkspaceState } from './useTransformWorkspaceState';

type DocumentState = ReturnType<typeof useDocumentWorkspace>;
type DrawingState = ReturnType<typeof useDrawingWorkspaceState>;
type TransformState = ReturnType<typeof useTransformWorkspaceState>;

interface Options {
    document: DocumentState;
    drawing: DrawingState;
    transforms: TransformState;
    expandedSelectedIds: () => string[];
    confirm: ReturnType<typeof useConfirmation>['confirm'];
    setStatus: Dispatch<SetStateAction<string>>;
    onFitView(): void;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setEmptyStateDismissed: Dispatch<SetStateAction<boolean>>;
    setDraftProgress: Dispatch<
        SetStateAction<{ percent: number; label: string } | null>
    >;
    setOffsetPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setBooleanPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setEditingId: Dispatch<SetStateAction<string | null>>;
    rotaryProject?: unknown;
    onLoadRotaryProject?: (slice: unknown) => void;
}

/** Cohesive document-edit command wiring; state remains owned by its domains. */
export function useDocumentEditingCommands({
    document,
    drawing,
    transforms,
    expandedSelectedIds,
    confirm,
    setStatus,
    onFitView,
    setDraftPreview,
    setEmptyStateDismissed,
    setDraftProgress,
    setOffsetPreview,
    setBooleanPreview,
    setEditingId,
    rotaryProject,
    onLoadRotaryProject,
}: Options) {
    const {
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        stock,
        fileName,
        setBounds,
        setLoops,
        setSelected,
        setHidden,
        setStack,
        setBitmaps,
        setGuides,
        setStock,
        setFileName,
        pushHistory,
        refreshBounds,
        newLoopId,
        withIds,
    } = document;

    const projectFiles = useProjectFileCommands({
        layers: document.layers,
        activeLayerId: document.activeLayerId,
        setLayers: document.setLayers,
        setActiveLayerId: document.setActiveLayerId,
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        stock,
        fileName,
        setLoops,
        setSelected,
        setHidden,
        setStack,
        setBitmaps,
        setGuides,
        setStock,
        setFileName,
        setStatus,
        pushHistory,
        newLoopId,
        rotaryProject,
        onLoadRotaryProject,
        onLoadedBounds: (loadedLoops) => {
            refreshBounds(loadedLoops);
            onFitView();
        },
    });

    const trim = useTrimCommands<ViewLoop, ToolpathStackEntry>({
        loops,
        selected,
        newLoopId,
        pushHistory,
        refreshBounds,
        setLoops,
        setSelected,
        setStack,
        setStatus,
    });

    const draw = useDrawCommands<ViewLoop, ToolpathStackEntry>({
        drawTool: drawing.drawTool,
        guides,
        drawText: drawing.drawText,
        drawFont: drawing.drawFont,
        drawTextHeight: drawing.drawTextHeight,
        newLoopId,
        withIds,
        pushHistory,
        refreshBounds,
        setLoops,
        setSelected,
        setStack,
        setStatus,
    });

    const selection = useSelectionCommands<ViewLoop, ToolpathStackEntry>({
        loops,
        selected,
        expandedSelectedIds,
        confirm,
        pushHistory,
        refreshBounds,
        moveAfterCloneRef: transforms.moveAfterCloneRef,
        setLoops,
        setSelected,
        setHidden,
        setStack,
        setDraftPreview,
        setStatus,
    });

    const canvas = useNewCanvasCommand<
        ViewLoop,
        ToolpathStackEntry,
        PlacedBitmapRecord,
        Guide
    >({
        layers: document.layers,
        setLayers: document.setLayers,
        setActiveLayerId: document.setActiveLayerId,
        loops,
        stack,
        bitmaps,
        pushHistory,
        setEmptyStateDismissed,
        setSelected,
        setHidden,
        setLoops,
        setBounds,
        setBitmaps,
        setStack,
        setGuides,
        setTabMode: drawing.setTabMode,
        setEditingId,
        setDraftPreview,
        setDraftProgress,
        setOffsetPreview,
        setBooleanPreview,
        setActiveTool: drawing.setActiveTool,
        setDrawTool: drawing.setDrawTool,
        clearTransform: () => transforms.setTransformMode(null),
        setFileName,
        setStatus,
    });

    return { ...projectFiles, ...trim, ...draw, ...selection, ...canvas };
}
