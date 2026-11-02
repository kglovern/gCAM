/**
 * Purpose: Implementation module for cam-worker-client in the engine domain.
 */
import {
    isWorkerError,
    isWorkerProgress,
    type CamWorkerMessage,
    type CamWorkerProgress,
    type BuildGcodeRequest,
    type ProcessLaserImageRequest,
    type ProcessedLaserImage,
    type ExportProgramRequest,
    type BuildToolpathRequest,
    type SerializedCamLoop,
    type SerializedCamToolpath,
    type TraceBitmapRequest,
    type VectorBitmapWorkerRequest,
    type PathRepairWorkerRequest,
    type ArrangeArtworkWorkerRequest,
    type PatternArtworkWorkerRequest,
    type FlattenImageWorkerRequest,
    type BitmapHeightmapWorkerRequest,
    type CutDepthPreviewWorkerRequest,
} from './cam-worker-protocol';
import { laserExportPayload } from '../gcode/laserExportPayload';

let workerRef: Worker | null = null;
let requestId = 0;

interface PendingRequest<T> {
    resolve: (value: T) => void;
    reject: (reason: Error) => void;
    onProgress?: (progress: CamWorkerProgress) => void;
}

const pendingRequests = new Map<number, PendingRequest<unknown>>();
type RequestWithoutId =
    | Omit<BuildToolpathRequest, 'id'>
    | Omit<BuildGcodeRequest, 'id'>
    | Omit<ExportProgramRequest, 'id'>
    | Omit<ProcessLaserImageRequest, 'id'>
    | Omit<TraceBitmapRequest, 'id'>
    | Omit<VectorBitmapWorkerRequest, 'id'>
    | Omit<PathRepairWorkerRequest, 'id'>
    | Omit<ArrangeArtworkWorkerRequest, 'id'>
    | Omit<PatternArtworkWorkerRequest, 'id'>
    | Omit<FlattenImageWorkerRequest, 'id'>
    | Omit<BitmapHeightmapWorkerRequest, 'id'>
    | Omit<CutDepthPreviewWorkerRequest, 'id'>;

function getWorker(): Worker {
    if (workerRef) return workerRef;
    workerRef = new Worker(new URL('./cam-worker.ts', import.meta.url), {
        type: 'module',
    });
    workerRef.addEventListener('message', handleWorkerMessage);
    workerRef.addEventListener('error', (event) => {
        rejectAllPending(new Error(event.message || 'CAM worker failed.'));
    });
    return workerRef;
}

function handleWorkerMessage(event: MessageEvent<CamWorkerMessage>) {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    if (isWorkerProgress(message)) {
        pending.onProgress?.(message.progress);
        return;
    }
    pendingRequests.delete(message.id);
    if (isWorkerError(message)) {
        const error = new Error(message.error);
        if (message.stack) error.stack = message.stack;
        pending.reject(error);
        return;
    }
    pending.resolve(message.result);
}

function rejectAllPending(error: Error) {
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
}

function postWorkerRequest<T>(
    request: RequestWithoutId,
    onProgress?: (progress: CamWorkerProgress) => void,
): { promise: Promise<T>; cancel: () => void } {
    const worker = getWorker();
    const id = ++requestId;
    let settled = false;
    const promise = new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, {
            resolve: (value) => {
                settled = true;
                resolve(value as T);
            },
            reject: (error) => {
                settled = true;
                reject(error);
            },
            onProgress,
        });
        try {
            worker.postMessage({ ...request, id });
        } catch (error) {
            pendingRequests.delete(id);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
    return {
        promise,
        cancel: () => {
            if (settled || !pendingRequests.has(id)) return;
            pendingRequests.delete(id);
            if (request.type !== 'export-program')
                worker.postMessage({
                    id: ++requestId,
                    type: 'cancel',
                    targetId: id,
                });
        },
    };
}

export type SerializedLoop = SerializedCamLoop;
export type SerializedToolpath = SerializedCamToolpath;

function serializeLoop(loop: SerializedLoop): SerializedLoop {
    return {
        id: loop.id,
        ...(loop.groupId !== undefined ? { groupId: loop.groupId } : {}),
        points: loop.points.map((point) => ({ x: point.x, y: point.y })),
        isBitmap: loop.isBitmap ?? false,
        bounds: loop.bounds ? { ...loop.bounds } : undefined,
    };
}

export function createToolpathInWorker(
    selectedLoops: SerializedLoop[],
    config: Record<string, unknown>,
    options: {
        id?: string;
        label?: string;
        onProgress?: (progress: CamWorkerProgress) => void;
        signal?: AbortSignal;
        validateResult?: boolean;
    } = {},
): Promise<SerializedToolpath> {
    const send = String(config.operation).startsWith('laser-')
        ? postIsolatedWorkerRequest<SerializedToolpath>
        : postWorkerRequest<SerializedToolpath>;
    return send(
        {
            type: 'build-toolpath',
            selectedLoops: selectedLoops.map(serializeLoop),
            config: { ...config },
            toolpathOptions: {
                id: options.id,
                label: options.label,
                ...(options.validateResult ? { validateResult: true } : {}),
            },
        },
        options.onProgress,
        options.signal,
    ).promise;
}

export function buildGcodeInWorker(params: {
    toolpaths: SerializedToolpath[];
    fileName: string;
    forcePolylineArcs: boolean;
    onProgress?: (progress: CamWorkerProgress) => void;
    signal?: AbortSignal;
}): Promise<string> {
    const send = params.toolpaths.some((p) =>
        String(p.operation).startsWith('laser-'),
    )
        ? postIsolatedWorkerRequest<string>
        : postWorkerRequest<string>;
    return send(
        {
            type: 'build-gcode',
            toolpaths: params.toolpaths.some((p) =>
                String(p.operation).startsWith('laser-'),
            )
                ? (laserExportPayload(params.toolpaths) as SerializedToolpath[])
                : params.toolpaths,
            fileName: params.fileName,
            forcePolylineArcs: params.forcePolylineArcs,
        },
        params.onProgress,
        params.signal,
    ).promise;
}

export function terminateWorker() {
    if (!workerRef) return;
    workerRef.terminate();
    workerRef = null;
    rejectAllPending(new Error('Worker terminated.'));
}

/** Controller rendering and canonical emission run together off the UI thread. */
export function exportProgramInWorker(
    request: Omit<ExportProgramRequest, 'id' | 'type'>,
) {
    return postIsolatedWorkerRequest<string>({
        ...request,
        type: 'export-program',
    });
}

function postIsolatedWorkerRequest<T>(
    request: RequestWithoutId,
    onProgress?: (progress: CamWorkerProgress) => void,
    signal?: AbortSignal,
    transfer?: Transferable[],
): { promise: Promise<T>; cancel: () => void } {
    if (signal?.aborted)
        return {
            promise: Promise.reject(
                new DOMException('Laser build cancelled.', 'AbortError'),
            ),
            cancel: () => {},
        };
    // Synchronous emission cannot process a cancel message while it is running.
    const worker =
        request.type === 'cut-depth-preview'
            ? new Worker(
                  new URL('./cut-depth-preview.worker.ts', import.meta.url),
                  { type: 'module' },
              )
            : request.type === 'bitmap-heightmap'
              ? new Worker(
                    new URL('./bitmap-heightmap.worker.ts', import.meta.url),
                    { type: 'module' },
                )
              : request.type === 'flatten-image'
                ? new Worker(
                      new URL('./flatten-image.worker.ts', import.meta.url),
                      { type: 'module' },
                  )
                : request.type === 'path-repair' ||
                    request.type === 'arrange-artwork' ||
                    request.type === 'pattern-artwork'
                  ? new Worker(
                        new URL('./path-repair.worker.ts', import.meta.url),
                        {
                            type: 'module',
                        },
                    )
                  : request.type === 'vector-bitmap'
                    ? new Worker(
                          new URL('./vector-bitmap.worker.ts', import.meta.url),
                          { type: 'module' },
                      )
                    : request.type === 'trace-bitmap'
                      ? new Worker(
                            new URL('./trace.worker.ts', import.meta.url),
                            {
                                type: 'module',
                            },
                        )
                      : new Worker(
                            new URL('./cam-worker.ts', import.meta.url),
                            {
                                type: 'module',
                            },
                        );
    const id = ++requestId;
    let settled = false;
    let rejectRequest: (error: Error) => void;
    const finish = () => {
        settled = true;
        signal?.removeEventListener('abort', cancel);
        worker.terminate();
    };
    const cancel = () => {
        if (settled) return;
        finish();
        rejectRequest(new DOMException('Laser build cancelled.', 'AbortError'));
    };
    const promise = new Promise<T>((resolve, reject) => {
        rejectRequest = reject;
        worker.addEventListener(
            'message',
            (event: MessageEvent<CamWorkerMessage>) => {
                const message = event.data;
                if (settled || message.id !== id) return;
                if (isWorkerProgress(message)) {
                    onProgress?.(message.progress);
                    return;
                }
                finish();
                if (isWorkerError(message)) {
                    const error = new Error(message.error);
                    if (message.stack) error.stack = message.stack;
                    reject(error);
                } else resolve(message.result as T);
            },
        );
        worker.addEventListener('error', (event) => {
            if (settled) return;
            finish();
            reject(new Error(event.message || 'Laser export worker failed.'));
        });
        try {
            if (transfer) worker.postMessage({ ...request, id }, transfer);
            else worker.postMessage({ ...request, id });
        } catch (error) {
            finish();
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
    if (!settled) signal?.addEventListener('abort', cancel, { once: true });
    return { promise, cancel };
}

export function processLaserImageInWorker(
    request: Omit<ProcessLaserImageRequest, 'id' | 'type'>,
    onProgress?: (progress: CamWorkerProgress) => void,
) {
    return postIsolatedWorkerRequest<ProcessedLaserImage>(
        { ...request, type: 'process-laser-image' },
        onProgress,
    );
}
export function traceBitmapInWorker(
    request: Omit<TraceBitmapRequest, 'id' | 'type'>,
) {
    return postIsolatedWorkerRequest<import('../lib/trace').PlacedTrace[]>(
        { ...request, type: 'trace-bitmap' },
        undefined,
        undefined,
        [request.image.data.buffer as ArrayBuffer],
    );
}

export function vectorBitmapInWorker(
    request: import('../lib/vector-bitmap').VectorBitmapRequest,
) {
    return postIsolatedWorkerRequest<
        import('../lib/vector-bitmap').VectorBitmapResult
    >({ type: 'vector-bitmap', request });
}

export function repairPathsInWorker(
    request: import('../lib/path-repair').PathRepairRequest,
) {
    return postIsolatedWorkerRequest<
        import('../lib/path-repair').PathRepairResult
    >({ type: 'path-repair', request });
}
export function arrangeArtworkInWorker(
    source: import('../lib/arrange-artwork').LayoutSource,
    action: import('../lib/arrange-artwork').LayoutAction,
) {
    return postIsolatedWorkerRequest<
        import('../lib/arrange-artwork').LayoutResult
    >({
        type: 'arrange-artwork',
        request: {
            action,
            source: {
                ...source,
                bitmaps: source.bitmaps.map(({ id, x, y, w, h, rotation }) => ({
                    id,
                    x,
                    y,
                    w,
                    h,
                    rotation,
                })),
            },
        },
    });
}

export function patternArtworkInWorker(
    shapes: import('../canvas/types').ViewLoop[],
    settings: import('../lib/pattern-artwork').PatternSettings,
) {
    return postIsolatedWorkerRequest<
        import('../lib/pattern-artwork').PatternResult
    >({
        type: 'pattern-artwork',
        request: { shapes, settings },
    });
}

export function cutDepthPreviewInWorker(
    toolpaths: Record<string, unknown>[],
    stockThickness?: number,
) {
    return postIsolatedWorkerRequest<
        import('../lib/cut-depth-preview').DepthPreviewImage
    >({ type: 'cut-depth-preview', toolpaths, stockThickness });
}

export function flattenImageInWorker(
    request: import('../lib/flatten-image').FlattenImageRequest,
    onProgress?: (progress: CamWorkerProgress) => void,
) {
    return postIsolatedWorkerRequest<
        import('../lib/flatten-image').FlattenImageResult
    >({ type: 'flatten-image', request }, onProgress, undefined, [
        request.image.data.buffer as ArrayBuffer,
    ]);
}

export function bitmapHeightmapInWorker(
    request: import('../lib/bitmap-heightmap').BitmapHeightmapRequest,
    signal?: AbortSignal,
) {
    return postIsolatedWorkerRequest<
        import('./surface-model').StoredSurfaceMesh
    >({ type: 'bitmap-heightmap', request }, undefined, signal, [
        request.image.data.buffer as ArrayBuffer,
    ]);
}
