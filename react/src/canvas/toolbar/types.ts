/**
 * Purpose: Implementation module for types in the canvas domain.
 */
import type { DrawTool } from '../../draw/geometry';
import type { BooleanOperation } from '../../lib/engine';
import type { Guide } from '../../lib/guides';
import type { TransformMode } from '../../lib/transform';
import type { UnitSystem } from '../../lib/units';

/** The expanded inline editor currently visible below the canvas toolbar. */
export type ToolbarAction =
    | null
    | 'draw'
    | 'edit'
    | 'modify'
    | 'fillet'
    | 'chamfer'
    | 'offset'
    | 'boolean'
    | 'nest'
    | 'guides';

/** Complete command surface for the canvas toolbar composition root. */
export interface CanvasToolbarProps {
    units: UnitSystem;
    activeTool: 'select' | 'draw' | 'trim';
    onSelectMode: () => void;
    drawTool: DrawTool;
    onDrawTool: (t: NonNullable<DrawTool>) => void;
    transformMode: TransformMode | null;
    onTransformMode: (m: TransformMode | null) => void;
    moveX: number;
    moveY: number;
    onMoveX: (v: number) => void;
    onMoveY: (v: number) => void;
    onApplyMove: () => void;
    rotateDeg: number;
    onRotateDeg: (v: number) => void;
    onApplyRotate: () => void;
    sizeW: number;
    sizeH: number;
    onSizeW: (v: number) => void;
    onSizeH: (v: number) => void;
    aspectLock: boolean;
    onAspectLock: (v: boolean) => void;
    onApplyScale: () => void;
    cornerRadius: number;
    onCornerRadius: (v: number) => void;
    onApplyFillet: () => void;
    onApplyChamfer?: () => void;
    onApplyDogbone: () => void;
    offsetAmount: number;
    onOffsetAmount: (v: number) => void;
    onApplyOffset: () => void;
    offsetSource: { points: { x: number; y: number }[] }[];
    onOffsetPreview: (contours: { x: number; y: number }[][]) => void;
    onBoolean: (op: BooleanOperation) => void;
    canBoolean: boolean;
    booleanSource: { points: { x: number; y: number }[] }[];
    onBooleanPreview: (contours: { x: number; y: number }[][]) => void;
    sheetW: number;
    sheetH: number;
    nestBorder?: number;
    onNestBorder?: (v: number) => void;
    nestSpacing?: number;
    onNestSpacing?: (v: number) => void;
    onSheetW: (v: number) => void;
    onSheetH: (v: number) => void;
    onApplyNest: () => void;
    onAddGuide: () => void;
    onDeleteGuide: (id: string) => void;
    guides: Guide[];
    hasSelection: boolean;
    hasGeometry: boolean;
    onDuplicate: () => void;
    onDeleteSelected: () => void;
    showTrace: boolean;
    tracing: boolean;
    onTrace: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onImportFile?: () => void;
    onImportProject?: () => void;
    onExportProject?: () => void;
    onNewCanvas?: () => void;
    onToggleObjects?: () => void;
    onViewPreview?: () => void;
    onViewConfig?: () => void;
    onToggleDarkMode?: () => void;
    onClearGuides?: () => void;
    onTrim?: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    canGroup?: boolean;
    canUngroup?: boolean;
    onFitView?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    snapToGrid?: boolean;
    onToggleSnapToGrid?: () => void;
}
