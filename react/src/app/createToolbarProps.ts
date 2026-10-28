/**
 * Purpose: Application composition module for createToolbarProps.
 */
import type {
    ComponentProps,
    Dispatch,
    RefObject,
    SetStateAction,
} from 'react';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import type { ViewLoop } from '../canvas/types';
import type { Guide } from '../lib/guides';
import type { UnitSystem } from '../lib/units';
import type { GridState } from '../components/ConfigPanel';
import type { BooleanOperation } from '../lib/engine';
import { useArrangeWorkspaceState } from './useArrangeWorkspaceState';
import { useDrawingWorkspaceState } from './useDrawingWorkspaceState';
import { useTransformWorkspaceState } from './useTransformWorkspaceState';

type DrawingState = ReturnType<typeof useDrawingWorkspaceState>;
type TransformState = ReturnType<typeof useTransformWorkspaceState>;
type ArrangeState = ReturnType<typeof useArrangeWorkspaceState>;

interface ToolbarActions {
    applyMove: () => void;
    applyRotate: () => void;
    applyScale: () => void;
    setSizeW: (value: number) => void;
    setSizeH: (value: number) => void;
    applyFillet: () => void;
    applyChamfer: () => void;
    applyDogbone: () => void;
    applyOffset: () => void;
    applyBoolean: (operation: BooleanOperation) => void;
    applyNest: () => void;
    addGuide: () => void;
    deleteGuide: (id: string) => void;
    duplicate: () => void;
    deleteSelected: () => void;
    trace: () => void;
    undo: () => void;
    redo: () => void;
    exportProject: () => void;
    importProject: () => void;
    newCanvas: () => void;
    group: () => void;
    ungroup: () => void;
}

interface ToolbarOptions {
    units: UnitSystem;
    drawing: DrawingState;
    transforms: TransformState;
    arrange: ArrangeState;
    loops: ViewLoop[];
    selected: string[];
    guides: Guide[];
    offsetSource: ViewLoop[];
    booleanSource: ViewLoop[];
    canUndo: boolean;
    canRedo: boolean;
    canGroup: boolean;
    canUngroup: boolean;
    traceAvailable: boolean;
    darkMode: boolean;
    snapToGrid: boolean;
    fileRef: RefObject<HTMLInputElement>;
    projectRef: RefObject<HTMLInputElement>;
    setGrid: Dispatch<SetStateAction<GridState>>;
    setSideTab: (tab: 'toolpaths' | 'preview' | 'config') => void;
    setDarkMode: Dispatch<SetStateAction<boolean>>;
    setViewportCommand: Dispatch<
        SetStateAction<
            { type: 'fit' | 'zoomIn' | 'zoomOut'; token: number } | undefined
        >
    >;
    setOffsetPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setBooleanPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    actions: ToolbarActions;
}

/** Adapts independently-owned command state to the canvas toolbar contract. */
export function createToolbarProps({
    units,
    drawing,
    transforms,
    arrange,
    loops,
    selected,
    guides,
    offsetSource,
    booleanSource,
    canUndo,
    canRedo,
    canGroup,
    canUngroup,
    traceAvailable,
    darkMode,
    snapToGrid,
    fileRef,
    projectRef,
    setGrid,
    setSideTab,
    setDarkMode,
    setViewportCommand,
    setOffsetPreview,
    setBooleanPreview,
    actions,
}: ToolbarOptions): ComponentProps<typeof CanvasToolbar> {
    const clearGuidePlacement = () => {
        drawing.setGuidePlacement(null);
        drawing.setGuideDraft(null);
    };
    return {
        units,
        activeTool:
            drawing.activeTool === 'draw'
                ? 'draw'
                : drawing.activeTool === 'trim'
                  ? 'trim'
                  : 'select',
        onSelectMode: () => {
            clearGuidePlacement();
            drawing.setActiveTool('select');
            transforms.setTransformMode(null);
            arrange.setCornerTool(null);
        },
        drawTool: drawing.drawTool,
        onDrawTool: (tool) => {
            clearGuidePlacement();
            drawing.setDrawTool(tool);
            drawing.setActiveTool('draw');
            transforms.setTransformMode(null);
        },
        transformMode: transforms.transformMode,
        onTransformMode: (mode) => {
            clearGuidePlacement();
            drawing.setDrawTool(null);
            drawing.setActiveTool('select');
            arrange.setCornerTool(null);
            transforms.setTransformMode(mode);
        },
        moveX: transforms.moveX,
        moveY: transforms.moveY,
        onMoveX: transforms.setMoveX,
        onMoveY: transforms.setMoveY,
        onApplyMove: actions.applyMove,
        rotateDeg: transforms.rotateDeg,
        onRotateDeg: transforms.setRotateDeg,
        onApplyRotate: actions.applyRotate,
        sizeW: transforms.sizeW,
        sizeH: transforms.sizeH,
        onSizeW: actions.setSizeW,
        onSizeH: actions.setSizeH,
        aspectLock: transforms.aspectLock,
        onAspectLock: transforms.setAspectLock,
        onApplyScale: actions.applyScale,
        cornerRadius: arrange.cornerRadius,
        onCornerRadius: arrange.setCornerRadius,
        onApplyFillet: actions.applyFillet,
        onApplyChamfer: actions.applyChamfer,
        onApplyDogbone: actions.applyDogbone,
        offsetAmount: arrange.offsetAmount,
        onOffsetAmount: arrange.setOffsetAmount,
        onApplyOffset: actions.applyOffset,
        offsetSource,
        onOffsetPreview: setOffsetPreview,
        onBoolean: actions.applyBoolean,
        canBoolean: selected.length >= 2,
        booleanSource,
        onBooleanPreview: setBooleanPreview,
        sheetW: arrange.sheetW,
        sheetH: arrange.sheetH,
        nestBorder: arrange.nestBorder,
        onNestBorder: arrange.setNestBorder,
        nestSpacing: arrange.nestSpacing,
        onNestSpacing: arrange.setNestSpacing,
        onSheetW: arrange.setSheetW,
        onSheetH: arrange.setSheetH,
        onApplyNest: actions.applyNest,
        onAddGuide: actions.addGuide,
        onDeleteGuide: actions.deleteGuide,
        guides,
        hasSelection: selected.length > 0,
        hasGeometry: loops.length > 0,
        onDuplicate: actions.duplicate,
        onDeleteSelected: actions.deleteSelected,
        showTrace: traceAvailable,
        tracing: drawing.traceOpen,
        onTrace: actions.trace,
        onUndo: actions.undo,
        onRedo: actions.redo,
        canUndo,
        canRedo,
        onImportFile: () => fileRef.current?.click(),
        onImportProject: actions.importProject,
        onExportProject: actions.exportProject,
        onNewCanvas: actions.newCanvas,
        onToggleObjects: () => drawing.setTreeOpen((open) => !open),
        onViewPreview: () => setSideTab('preview'),
        onViewConfig: () => setSideTab('config'),
        onToggleDarkMode: () => setDarkMode(!darkMode),
        snapToGrid,
        onToggleSnapToGrid: () =>
            setGrid((current) => ({ ...current, snap: !current.snap })),
        onClearGuides: () =>
            guides.forEach((guide) => actions.deleteGuide(guide.id)),
        onFitView: () => setViewportCommand({ type: 'fit', token: Date.now() }),
        onZoomIn: () =>
            setViewportCommand({ type: 'zoomIn', token: Date.now() }),
        onZoomOut: () =>
            setViewportCommand({ type: 'zoomOut', token: Date.now() }),
        onTrim: () => {
            clearGuidePlacement();
            drawing.setActiveTool('trim');
            transforms.setTransformMode(null);
        },
        onGroup: actions.group,
        onUngroup: actions.ungroup,
        canGroup,
        canUngroup,
    };
}
