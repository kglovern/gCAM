import type { CornerIntersection } from '../../lib/cornerIntersections';
/**
 * Purpose: Implementation module for types in the canvas domain.
 */
import type React from 'react';
import type { DrawTool } from '../../draw/geometry';
import type { TransformCommit, TransformMode } from '../../lib/transform';
import type { CornerHover, TransformDragState } from '../selectionGeometry';
import type { Guide, GuideDraft, GuidePlacement } from '../../lib/guides';
import type {
    Camera,
    LoopMeta,
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from '../types';

export type Point = { x: number; y: number };
export type CanvasMouseEvent = React.MouseEvent<HTMLCanvasElement>;

export type CanvasView = {
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: Point[][];
    darkMode: boolean;
    selected: string[];
    hidden: string[];
    tabMode: boolean;
    tabMarkers: TabMarker[];
    tabHover: TabHoverCandidate | null;
    drawTool: DrawTool;
    drawSides: number;
    polygonMode: 'inscribed' | 'circumscribed';
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    guides: Guide[];
    guidePlacement: 'edge' | null;
    guideDraft: GuideDraft | null;
    transformMode: TransformMode | null;
    cornerTool: 'fillet' | 'chamfer' | 'dogbone' | null;
    cornerRadius: number;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
};

export type CanvasPointerControllerProps = {
    canvasRef: { current: HTMLCanvasElement | null };
    viewRef: { current: CanvasView };
    clicksRef: { current: Point[] };
    cursorRef: { current: Point | null };
    draftRef: {
        current: { ax: number; ay: number; bx: number; by: number } | null;
    };
    downRef: { current: Point | null };
    panRef: { current: Point | null };
    marqueeRef: {
        current: { x0: number; y0: number; x1: number; y1: number } | null;
    };
    cameraRef: { current: Camera };
    updateCursor: (event: React.MouseEvent) => void;
    zoomBy: (factor: number, cx?: number, cy?: number) => void;
    forceTick: () => void;
    onViewportLeave: () => void;
    onCommitLoop: (points: Point[], meta?: LoopMeta) => void;
    activeTool: Tool;
    additiveSelection?: boolean;
    panMode?: boolean;
    onTrimAt?: (point: Point) => void;
    onTrimStroke?: (points: Point[]) => void;
    trimBrushRef: { current: { points: Point[] } | null };
    onTrimHover: (
        hover: {
            loopId: string;
            segmentIndex: number;
            removed?: Point[];
        } | null,
    ) => void;
    onPlaceGuide: (guide: GuidePlacement) => void;
    onGuideDraftChange: (draft: GuideDraft | null) => void;
    onCancelGuide: () => void;
    onCommitText: (at: Point) => void;
    onCommitMandala?: (at: Point) => void;
    onSelect: (ids: string[]) => void;
    onPlaceTab: (entryId: string, contourIndex: number, along: number) => void;
    onMoveTab: (entryId: string, tabIndex: number, along: number) => void;
    onDeleteTab: (entryId: string, tabIndex: number) => void;
    tabHoverRef: { current: TabHoverCandidate | null };
    tabDragRef: {
        current: { marker: TabMarker; along: number; moved: boolean } | null;
    };
    selectedTabRef: { current: TabMarker | null };
    pendingAnchorRef: { current: Point | null };
    angleSnapRef: { current: number | null };
    selectedGuideRef: { current: string | null };
    guideHoverRef: { current: string | null };
    loopHoverRef: {
        current: {
            loopId: string;
            segmentIndex: number;
            removed?: Point[];
        } | null;
    };
    onDeleteGuide: (id: string) => void;
    progressPointerRef: { current: Point | null };
    transformDragRef: { current: TransformDragState | null };
    onTransformCommit: (transform: TransformCommit | null) => void;
    onFilletCorner?: (
        loopId: string,
        cornerIndex: number,
        intersection?: CornerIntersection,
    ) => void;
    cornerHoverRef: { current: CornerHover | null };
};
