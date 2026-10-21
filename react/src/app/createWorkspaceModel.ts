/**
 * Purpose: Application composition module for createWorkspaceModel.
 */
import type { ComponentProps } from 'react';
import { CanvasStage } from '../canvas/CanvasStage';
import { CadInspector } from '../components/CadInspector';
import { ConfigPanel } from '../components/ConfigPanel';
import { ObjectTree } from '../components/ObjectTree';
import { OutputWorkspace } from '../toolpaths/OutputWorkspace';
import { RotaryPanel } from '../rotary/components/RotaryPanel';
import { ToolpathRail } from '../toolpaths/ToolpathRail';
import type { AppWorkspaceModel } from './AppWorkspace';
import type { EditorWorkspace } from './EditorWorkspace';
import { useArrangeWorkspaceState } from './useArrangeWorkspaceState';
import { useDrawingWorkspaceState } from './useDrawingWorkspaceState';
import { usePreviewState } from './usePreviewState';
import { useTransformWorkspaceState } from './useTransformWorkspaceState';
import { useDocumentWorkspace } from '../document/useDocumentWorkspace';

type CanvasProps = ComponentProps<typeof CanvasStage>;
type TreeProps = ComponentProps<typeof ObjectTree>;
type RailProps = ComponentProps<typeof ToolpathRail>;
type OutputProps = Omit<ComponentProps<typeof OutputWorkspace>, 'mode'>;
type ConfigProps = ComponentProps<typeof ConfigPanel>;
type RotaryProps = ComponentProps<typeof RotaryPanel>;
type DrawingState = ReturnType<typeof useDrawingWorkspaceState>;
type TransformState = ReturnType<typeof useTransformWorkspaceState>;
type ArrangeState = ReturnType<typeof useArrangeWorkspaceState>;
type PreviewState = ReturnType<typeof usePreviewState>;
type DocumentState = ReturnType<typeof useDocumentWorkspace>;

/**
 * Typed UI composition boundary.  The controller supplies finished props for
 * each domain; this function is the only place those domains become the
 * editor layout contract.  It deliberately carries no React context or
 * untyped escape hatches.
 */
export interface WorkspaceModelOptions {
    activeTab: ComponentProps<typeof EditorWorkspace>['activeTab'];
    onTabChange: ComponentProps<typeof EditorWorkspace>['onTabChange'];
    drawing: DrawingState;
    transforms: TransformState;
    arrange: ArrangeState;
    previews: PreviewState;
    document: DocumentState;
    inspectorPreview: CanvasProps['inspectorPreview'];
    preview: CanvasProps['preview'];
    tabMarkers: CanvasProps['tabMarkers'];
    canvasActions: Pick<
        CanvasProps,
        | 'onPlaceTab'
        | 'onMoveTab'
        | 'onDeleteTab'
        | 'onPlaceGuide'
        | 'onGuideDraftChange'
        | 'onCancelGuide'
        | 'onCommitLoop'
        | 'onTrimAt'
        | 'onTrimStroke'
        | 'onCommitText'
        | 'onPolygonSidesChange'
        | 'onPolygonModeChange'
        | 'onTransformCommit'
        | 'onFilletCorner'
        | 'onAdjustStock'
    > &
        Pick<CanvasProps, 'preserveViewToken' | 'viewportCommand'>;
    objectTreeActions: Pick<
        TreeProps,
        | 'onToggleHidden'
        | 'onDelete'
        | 'onGroup'
        | 'onUngroup'
        | 'onEdit'
        | 'onMove'
        | 'onResize'
        | 'onClose'
        | 'canGroup'
        | 'canUngroup'
    >;
    showEmptyState: boolean;
    onNewCanvas: () => void;
    onImport: () => void;
    onLoadSample: () => void;
    loadingSample: boolean;
    status: string;
    onDropFiles: (files: FileList) => void;
    inspector: ComponentProps<typeof CadInspector> | null;
    toolpathRailProps: RailProps;
    previewWorkspaceProps: OutputProps;
    configPanelProps: ConfigProps;
    rotaryPanelProps: RotaryProps;
}

export function createWorkspaceModel(
    options: WorkspaceModelOptions,
): AppWorkspaceModel {
    return {
        editor: {
            activeTab: options.activeTab,
            onTabChange: options.onTabChange,
            canvasProps: {
                activeTool: options.drawing.activeTool,
                loops: options.document.loops,
                bounds: options.document.bounds,
                preview: options.preview,
                inspectorPreview: options.inspectorPreview,
                draftPreview: options.previews.draftPreview.length
                    ? options.previews.draftPreview
                    : options.previews.offsetPreview.length
                      ? options.previews.offsetPreview
                      : options.previews.booleanPreview,
                draftProgress: options.previews.draftProgress,
                darkMode: options.configPanelProps.darkMode,
                selected: options.document.selected,
                tabMode: options.drawing.tabMode,
                tabMarkers: options.tabMarkers,
                drawTool:
                    options.drawing.activeTool === 'draw'
                        ? options.drawing.drawTool
                        : null,
                drawSides: options.drawing.drawSides,
                polygonMode: options.drawing.drawPolygonMode,
                grid: options.configPanelProps.grid,
                stock: options.previewWorkspaceProps.stock,
                guides: options.document.guides,
                guidePlacement: options.drawing.guidePlacement,
                guideDraft: options.drawing.guideDraft,
                bitmaps: options.document.bitmaps,
                hidden: options.document.hidden,
                transformMode: options.transforms.transformMode,
                cornerTool: options.arrange.cornerTool,
                cornerRadius: options.arrange.cornerRadius,
                units: options.configPanelProps.units,
                onSelect: options.document.setSelected,
                ...options.canvasActions,
            },
            objectTreeProps: {
                units: options.configPanelProps.units,
                loops: options.document.loops,
                bitmaps: options.document.bitmaps,
                selected: options.document.selected,
                hidden: options.document.hidden,
                onSelect: options.document.setSelected,
                ...options.objectTreeActions,
            },
            treeOpen: options.drawing.treeOpen,
            showEmptyState: options.showEmptyState,
            onNewCanvas: options.onNewCanvas,
            onImport: options.onImport,
            onLoadSample: options.onLoadSample,
            loadingSample: options.loadingSample,
            status: options.status,
            onDropFiles: options.onDropFiles,
            inspector: options.inspector,
            toolpathRailProps: options.toolpathRailProps,
            previewWorkspaceProps: options.previewWorkspaceProps,
            configPanelProps: options.configPanelProps,
            rotaryPanelProps: options.rotaryPanelProps,
        },
    };
}
