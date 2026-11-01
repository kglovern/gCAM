import type { OutputSettings } from '../gcode/profiles';
import type { UnitSystem } from '../lib/units';
import type { TracePixelsRequest } from '../lib/trace-pixels';
/**
 * Purpose: Implementation module for cam-worker-protocol in the engine domain.
 */
export interface CamWorkerProgress {
    percent: number;
    label: string;
}

export interface SerializedCamLoop {
    id?: string;
    groupId?: string;
    points: { x: number; y: number }[];
    isBitmap?: boolean;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SerializedCamToolpath {
    id: string;
    label: string;
    operation: string;
    previewContours: { x: number; y: number }[][];
    trochoidPreviewContours?: { x: number; y: number }[][];
    motionPaths: {
        safeToClose: boolean;
        points: { x: number; y: number; z: number }[];
    }[];
    tabs: {
        contourIndex: number;
        along: number;
        point?: { x: number; y: number } | null;
    }[];
    [key: string]: unknown;
}

export interface BuildToolpathRequest {
    id: number;
    type: 'build-toolpath';
    selectedLoops: SerializedCamLoop[];
    config: Record<string, unknown>;
    toolpathOptions: Record<string, unknown>;
}

export interface BuildGcodeRequest {
    id: number;
    type: 'build-gcode';
    toolpaths: SerializedCamToolpath[];
    fileName: string;
    forcePolylineArcs: boolean;
}

export interface ExportProgramRequest {
    id: number;
    type: 'export-program';
    toolpaths: Record<string, unknown>[];
    fileName: string;
    arcs: boolean;
    units: UnitSystem;
    settings: OutputSettings;
}

export interface ProcessLaserImageRequest {
    id: number;
    type: 'process-laser-image';
    bitmap: {
        bounds: { minX: number; minY: number; maxX: number; maxY: number };
        _imageData: { width: number; height: number; data: ArrayLike<number> };
    };
    interval: number;
    gamma: number;
    options: import('../toolpaths/toolpathRequest').LaserOptions;
}
export interface ProcessedLaserImage {
    width: number;
    height: number;
    widthMm: number;
    heightMm: number;
    data: Uint8ClampedArray;
}

export interface CancelCamRequest {
    id: number;
    type: 'cancel';
    targetId: number;
}
export interface TraceBitmapRequest extends TracePixelsRequest {
    id: number;
    type: 'trace-bitmap';
}

export type CamWorkerRequest =
    | BuildToolpathRequest
    | BuildGcodeRequest
    | ExportProgramRequest
    | CancelCamRequest
    | ProcessLaserImageRequest;

export interface CamWorkerProgressMessage {
    id: number;
    progress: CamWorkerProgress;
}

export interface CamWorkerResultMessage {
    id: number;
    result: unknown;
}

export interface CamWorkerErrorMessage {
    id: number;
    error: string;
    stack: string | null;
}

export type CamWorkerMessage =
    | CamWorkerProgressMessage
    | CamWorkerResultMessage
    | CamWorkerErrorMessage;

export function isWorkerProgress(
    message: CamWorkerMessage,
): message is CamWorkerProgressMessage {
    return 'progress' in message;
}

export function isWorkerError(
    message: CamWorkerMessage,
): message is CamWorkerErrorMessage {
    return 'error' in message;
}

export interface VectorBitmapWorkerRequest {
    id: number;
    type: 'vector-bitmap';
    request: import('../lib/vector-bitmap').VectorBitmapRequest;
}

export interface PathRepairWorkerRequest {
    id: number;
    type: 'path-repair';
    request: import('../lib/path-repair').PathRepairRequest;
}
export interface ArrangeArtworkWorkerRequest {
    id: number;
    type: 'arrange-artwork';
    request: {
        source: import('../lib/arrange-artwork').LayoutSource;
        action: import('../lib/arrange-artwork').LayoutAction;
    };
}

export interface PatternArtworkWorkerRequest {
    id: number;
    type: 'pattern-artwork';
    request: {
        shapes: import('../canvas/types').ViewLoop[];
        settings: import('../lib/pattern-artwork').PatternSettings;
    };
}

export interface FlattenImageWorkerRequest {
    id: number;
    type: 'flatten-image';
    request: import('../lib/flatten-image').FlattenImageRequest;
}

export interface BitmapHeightmapWorkerRequest {
    id: number;
    type: 'bitmap-heightmap';
    request: import('../lib/bitmap-heightmap').BitmapHeightmapRequest;
}
export interface CutDepthPreviewWorkerRequest {
    id: number;
    type: 'cut-depth-preview';
    toolpaths: Record<string, unknown>[];
    stockThickness?: number;
}
