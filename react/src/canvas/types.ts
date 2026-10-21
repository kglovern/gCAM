/**
 * Purpose: Implementation module for types in the react domain.
 */
import type { DrawTool } from '../draw/geometry';

export type Tool = 'select' | 'draw' | 'trim' | 'preview';

export interface TabMarker {
    entryId: string;
    tabIndex: number;
    contourIndex: number;
    along: number;
    previewIndex: number;
    x: number;
    y: number;
}

export interface ViewLoop {
    id: string;
    points: { x: number; y: number }[];
    bitmapId?: string;
    groupId?: string;
    layerId?: string;
    layerColor?: string;
    sourceType?: string;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
    text?: string;
    fontId?: string;
    fontSize?: number;
    exportGeometry?: { type?: string };
}

export interface ViewBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface Camera {
    scale: number;
    tx: number;
    ty: number;
}

export interface PreviewLoop {
    points: { x: number; y: number }[];
    entryId: string;
    intensity?: number;
    tabEligible?: boolean;
    tabWidth?: number;
    toolDiameter?: number;
}

export interface TabHoverCandidate {
    entryId: string;
    previewIndex: number;
    contourIndex: number;
    along: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    center: { x: number; y: number };
    spine: { x: number; y: number }[];
    toolDiameter: number;
}

export interface LoopMeta {
    sourceType?: string;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
}

export type { DrawTool };
