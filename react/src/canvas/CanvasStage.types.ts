import type { CornerIntersection } from '../lib/cornerIntersections';
/**
 * Purpose: Defines typed contracts used by CanvasStage.types.
 */
import type { DrawTool } from '../draw/geometry';
import type { TransformCommit, TransformMode } from '../lib/transform';
import type {
    LoopMeta,
    PreviewLoop,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';
import type { UnitSystem } from '../lib/units';
import type { JobStock } from '../job/stock';
import type { Guide, GuideDraft, GuidePlacement } from '../lib/guides';

export type Point = { x: number; y: number };

export type CanvasStageProps = {
    onShowProperties?: () => void;
    contextActions?: import('./VectorContextMenu').VectorContextActions;
    activeTool: Tool;
    additiveSelection?: boolean;
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: Point[][];
    inspectorPreview?: { id: string; points: Point[] } | null;
    draftProgress: { percent: number; label: string } | null;
    darkMode: boolean;
    selected: string[];
    hidden: string[];
    onSelect: (ids: string[]) => void;
    onAdjustStock?: () => void;
    tabMode: boolean;
    tabMarkers: TabMarker[];
    onPlaceTab: (entryId: string, contourIndex: number, along: number) => void;
    onMoveTab: (entryId: string, tabIndex: number, along: number) => void;
    onDeleteTab: (entryId: string, tabIndex: number) => void;
    drawTool: DrawTool;
    drawSides: number;
    polygonMode: 'inscribed' | 'circumscribed';
    onPolygonSidesChange?: (sides: number) => void;
    onPolygonModeChange?: (mode: 'inscribed' | 'circumscribed') => void;
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    stock: JobStock;
    guides: Guide[];
    guidePlacement?: 'edge' | null;
    guideDraft: GuideDraft | null;
    onPlaceGuide?: (guide: GuidePlacement) => void;
    onGuideDraftChange?: (draft: GuideDraft | null) => void;
    onCancelGuide?: () => void;
    onDeleteGuide?: (id: string) => void;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
    onCommitLoop: (points: Point[], meta?: LoopMeta) => void;
    onTrimAt?: (point: Point) => void;
    onTrimStroke?: (points: Point[]) => void;
    onCommitText: (at: Point) => void;
    onCommitMandala?: (at: Point) => void;
    transformMode: TransformMode | null;
    onTransformCommit: (t: TransformCommit | null) => void;
    cornerTool?: 'fillet' | 'chamfer' | 'dogbone' | null;
    cornerRadius?: number;
    onFilletCorner?: (
        loopId: string,
        cornerIndex: number,
        intersection?: CornerIntersection,
    ) => void;
    preserveViewToken?: number;
    viewportCommand?: { type: 'fit' | 'zoomIn' | 'zoomOut'; token: number };
    units?: UnitSystem;
};
