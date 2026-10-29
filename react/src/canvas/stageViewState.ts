/**
 * Purpose: Implementation module for stageViewState in the canvas domain.
 */
import type { DrawTool } from '../draw/geometry';
import type { TransformMode } from '../lib/transform';
import type { UnitSystem } from '../lib/units';
import type { JobStock } from '../job/stock';
import type { Guide, GuideDraft } from '../lib/guides';
import type {
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';

// Mutable render snapshot consumed by the imperative canvas painter.
export interface CanvasViewState {
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: { x: number; y: number }[][];
    inspectorPreview: {
        id: string;
        points: { x: number; y: number }[];
    } | null;
    darkMode: boolean;
    activeTool: Tool;
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
    stock: JobStock;
    guides: Guide[];
    guidePlacement: 'edge' | null;
    guideDraft: GuideDraft | null;
    transformMode: TransformMode | null;
    cornerTool: 'fillet' | 'chamfer' | 'dogbone' | null;
    cornerRadius: number;
    units: UnitSystem;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
}
