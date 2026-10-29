import { jobStockBounds } from '../job/stock';
import {
    buildClearingPathsAsync,
    buildRasterPathsAsync,
    buildWaterlinePathsAsync,
    applySurfaceBoundaryOverrun,
    rasterizeTopSurface,
    rasterPathRows,
    type HeightField,
    type SurfaceMesh,
    type SurfacePathOptions,
    type SurfacePathPoint,
} from './surface-cam';
import {
    computeSurfaceContactHeights,
    type SurfaceComputeProgress,
} from './surface-cam-webgpu';
import type { MachineTravelLimits } from '../cutting-parameters/types';
import {
    isSurfaceGpuFallbackError,
    surfaceCamAbortError,
    throwIfSurfaceCamAborted,
} from './surface-cam-cancel';

export type SurfaceStrategy =
    | 'surface-clear'
    | 'surface-finish'
    | 'surface-waterline';

export interface SurfaceCamRequest extends SurfacePathOptions {
    strategy: SurfaceStrategy;
    resolutionMm: number;
    travelLimits?: MachineTravelLimits;
    stock: {
        widthMm: number;
        heightMm: number;
        thicknessMm: number;
        origin?: 'front-left' | 'center';
    };
}

export interface SurfaceCamResult {
    strategy: SurfaceStrategy;
    paths: SurfacePathPoint[][];
    rows: number;
    columns: number;
    resolutionMm: number;
    coveredCells: number;
    computeBackend: 'webgpu' | 'cpu';
    rasterBackend: 'webgpu' | 'cpu';
}

/** Add a model-base floor across the requested rectangular machining area. */
export function rectangularSurfaceMesh(
    mesh: SurfaceMesh,
    marginMm = 0,
): SurfaceMesh {
    if (!Number.isFinite(marginMm) || marginMm < 0)
        throw new Error(
            'Machining margin must be a finite, non-negative distance.',
        );
    const bounds = {
        ...mesh.bounds,
        minX: mesh.bounds.minX - marginMm,
        minY: mesh.bounds.minY - marginMm,
        maxX: mesh.bounds.maxX + marginMm,
        maxY: mesh.bounds.maxY + marginMm,
    };
    const { minX: x0, minY: y0, maxX: x1, maxY: y1, minZ: z } = bounds;
    const vertices = new Float32Array(mesh.vertices.length + 18);
    vertices.set(mesh.vertices);
    vertices.set(
        [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z],
        mesh.vertices.length,
    );
    return { ...mesh, bounds, vertices };
}

/** Validate the generated cutter-center path against the physical job stock. */
export function validateSurfacePathsForStock(
    paths: SurfacePathPoint[][],
    request: SurfaceCamRequest,
): void {
    const { stock, toolDiameterMm, safeZMm, stockTopZMm } = request;
    const limits = request.travelLimits;
    if (
        ![stock.widthMm, stock.heightMm, stock.thicknessMm].every(
            (value) => Number.isFinite(value) && value > 0,
        )
    )
        throw new Error(
            '3D CAM requires positive, finite job stock dimensions.',
        );
    if (!(safeZMm > stockTopZMm))
        throw new Error(
            'Safe Z must be above the job stock top before generating 3D surface moves.',
        );
    const radius = toolDiameterMm / 2;
    const epsilon = 1e-4;
    if (
        paths.some((path) =>
            path.some(
                (point) =>
                    point.x - radius < jobStockBounds(stock).minX - epsilon ||
                    point.y - radius < jobStockBounds(stock).minY - epsilon ||
                    point.x + radius > jobStockBounds(stock).maxX + epsilon ||
                    point.y + radius > jobStockBounds(stock).maxY + epsilon,
            ),
        )
    )
        throw new Error(
            'The generated surface path puts the cutter outside the job stock. Move or resize the model, or use larger stock.',
        );
    const stockBottomZ = stockTopZMm - stock.thicknessMm;
    if (
        paths.some((path) =>
            path.some((point) => point.z < stockBottomZ - epsilon),
        )
    )
        throw new Error(
            'Cutter compensation would machine below the job stock bottom. Increase stock thickness or use a different setup.',
        );
    const moves = paths.flat();
    if (
        limits?.maxXTravelMm !== null &&
        limits?.maxXTravelMm !== undefined &&
        moves.some(
            ({ x }) =>
                x < jobStockBounds(stock).minX - epsilon ||
                x > jobStockBounds(stock).minX + limits.maxXTravelMm! + epsilon,
        )
    )
        throw new Error(
            `Generated X moves exceed the configured ${limits.maxXTravelMm} mm work travel for the stock origin.`,
        );
    if (
        limits?.maxYTravelMm !== null &&
        limits?.maxYTravelMm !== undefined &&
        moves.some(
            ({ y }) =>
                y < jobStockBounds(stock).minY - epsilon ||
                y > jobStockBounds(stock).minY + limits.maxYTravelMm! + epsilon,
        )
    )
        throw new Error(
            `Generated Y moves exceed the configured ${limits.maxYTravelMm} mm work travel for the stock origin.`,
        );
    const zMoves = [...moves.map(({ z }) => z), safeZMm];
    if (
        limits?.minZTravelMm !== null &&
        limits?.minZTravelMm !== undefined &&
        zMoves.some((z) => z < limits.minZTravelMm! - epsilon)
    )
        throw new Error(
            `Generated Z moves go below the configured ${limits.minZTravelMm} mm machine travel limit.`,
        );
    if (
        limits?.maxZTravelMm !== null &&
        limits?.maxZTravelMm !== undefined &&
        zMoves.some((z) => z > limits.maxZTravelMm! + epsilon)
    )
        throw new Error(
            `Generated Z moves exceed the configured ${limits.maxZTravelMm} mm machine travel limit, including the safe retract.`,
        );
}

function rasterizeInWorker(
    mesh: SurfaceMesh,
    resolutionMm: number,
    signal?: AbortSignal,
): Promise<HeightField> {
    try {
        throwIfSurfaceCamAborted(signal);
    } catch (error) {
        return Promise.reject(error);
    }
    if (typeof Worker === 'undefined')
        return Promise.resolve(rasterizeTopSurface(mesh, resolutionMm));
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL('./surface-raster.worker.ts', import.meta.url),
            { type: 'module' },
        );
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    'Surface rasterization timed out. Reduce model size or coarsen machining resolution.',
                ),
            );
        }, 120_000);
        const cleanup = () => {
            window.clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker.terminate();
        };
        const abort = () => {
            cleanup();
            reject(surfaceCamAbortError());
        };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = (
            event: MessageEvent<{
                id: string;
                field?: HeightField;
                error?: string;
            }>,
        ) => {
            if (event.data.id !== id) return;
            cleanup();
            if (event.data.error) reject(new Error(event.data.error));
            else if (event.data.field) resolve(event.data.field);
            else reject(new Error('Surface raster worker returned no field.'));
        };
        worker.onerror = (event) => {
            cleanup();
            reject(new Error(event.message || 'Surface raster worker failed.'));
        };
        const vertices = new Float32Array(mesh.vertices);
        worker.postMessage(
            {
                id,
                resolutionMm,
                mesh: { ...mesh, vertices },
            },
            [vertices.buffer],
        );
    });
}

async function rasterizeSurface(
    mesh: SurfaceMesh,
    resolutionMm: number,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
): Promise<{ field: HeightField; backend: 'webgpu' | 'cpu' }> {
    const cpuRaster = async (reason?: string) => {
        throwIfSurfaceCamAborted(signal);
        onProgress?.({
            percent: 2,
            label: reason
                ? `WebGPU raster unavailable (${reason}); rasterizing STL in a CPU worker`
                : 'Rasterizing STL in a CPU worker',
        });
        return {
            field: await rasterizeInWorker(mesh, resolutionMm, signal),
            backend: 'cpu' as const,
        };
    };
    throwIfSurfaceCamAborted(signal);
    if (
        typeof Worker === 'undefined' ||
        typeof navigator === 'undefined' ||
        !('gpu' in navigator)
    )
        return cpuRaster();
    onProgress?.({ percent: 2, label: 'Rasterizing STL with WebGPU' });
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker(
                new URL('./surface-raster-webgpu.worker.ts', import.meta.url),
                { type: 'module' },
            );
        } catch (error) {
            void cpuRaster(
                error instanceof Error
                    ? error.message
                    : 'WebGPU worker unavailable',
            ).then(resolve, reject);
            return;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    'WebGPU surface raster timed out. Increase machining resolution or simplify the STL.',
                ),
            );
        }, 120_000);
        const cleanup = () => {
            window.clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker.terminate();
        };
        const abort = () => {
            cleanup();
            reject(surfaceCamAbortError());
        };
        signal?.addEventListener('abort', abort, { once: true });
        const fallback = (reason: string) => {
            cleanup();
            if (signal?.aborted) {
                reject(surfaceCamAbortError());
                return;
            }
            void cpuRaster(reason).then(resolve, reject);
        };
        worker.onmessage = (
            event: MessageEvent<{
                id: string;
                field?: HeightField;
                error?: string;
            }>,
        ) => {
            if (event.data.id !== id) return;
            if (
                event.data.error &&
                isSurfaceGpuFallbackError(event.data.error)
            ) {
                fallback(event.data.error);
                return;
            }
            cleanup();
            if (event.data.error) reject(new Error(event.data.error));
            else if (event.data.field)
                resolve({ field: event.data.field, backend: 'webgpu' });
            else reject(new Error('WebGPU raster worker returned no field.'));
        };
        worker.onerror = (event) => {
            cleanup();
            reject(new Error(event.message || 'WebGPU raster worker failed.'));
        };
        const vertices = new Float32Array(mesh.vertices);
        worker.postMessage(
            {
                id,
                vertices,
                bounds: mesh.bounds,
                sourceName: mesh.sourceName,
                resolutionMm,
            },
            [vertices.buffer],
        );
    });
}

/** Build cutter-compensated 3-axis paths; machining compensation is WebGPU-only. */
export async function generateSurfaceCamPaths(
    mesh: SurfaceMesh,
    request: SurfaceCamRequest,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
): Promise<SurfaceCamResult> {
    throwIfSurfaceCamAborted(signal);
    if (
        !(request.toolDiameterMm > 0) ||
        !Number.isFinite(request.toolDiameterMm)
    )
        throw new Error(
            'Select a library cutter with a positive cutting diameter.',
        );
    if (!(request.resolutionMm > 0) || !Number.isFinite(request.resolutionMm))
        throw new Error(
            'Machining resolution must be a positive finite value.',
        );
    if (!(request.stepoverMm > 0) || !Number.isFinite(request.stepoverMm))
        throw new Error('Stepover must be a positive finite value.');
    if (
        request.strategy !== 'surface-waterline' &&
        request.stepoverMm + 1e-9 < request.resolutionMm
    )
        throw new Error(
            'Machining grid resolution must be no larger than stepover. Reduce the grid size to achieve the requested pass spacing.',
        );
    if (!(request.stepdownMm > 0) || !Number.isFinite(request.stepdownMm))
        throw new Error('Stepdown must be a positive finite value.');
    if (
        !Number.isFinite(request.boundaryMm ?? 0) ||
        (request.boundaryMm ?? 0) < 0
    )
        throw new Error(
            'Machining margin must be a finite, non-negative distance.',
        );
    const areaMargin =
        request.boundaryMode === 'rectangle' ? (request.boundaryMm ?? 0) : 0;
    const columns =
        Math.ceil(
            (mesh.bounds.maxX - mesh.bounds.minX + 2 * areaMargin) /
                request.resolutionMm,
        ) + 1;
    const rows =
        Math.ceil(
            (mesh.bounds.maxY - mesh.bounds.minY + 2 * areaMargin) /
                request.resolutionMm,
        ) + 1;
    if (columns * rows > 16_000_000)
        throw new Error(
            'The requested machining resolution exceeds the 16-million-cell limit. Increase grid size.',
        );
    const radiusCells = Math.ceil(
        (request.toolDiameterMm / 2 + (request.resolutionMm / 2) * Math.SQRT2) /
            request.resolutionMm,
    );
    const neighborhoodSamples = Math.PI * radiusCells * radiusCells;
    const contactRows =
        request.strategy === 'surface-waterline'
            ? rows
            : rasterPathRows(
                  rows,
                  Math.max(
                      1,
                      Math.floor(
                          request.stepoverMm / request.resolutionMm + 1e-9,
                      ),
                  ),
              ).length;
    if (columns * contactRows * neighborhoodSamples > 250_000_000)
        throw new Error(
            'This cutter and grid would create an oversized WebGPU contact query. Increase grid size or use a smaller cutter.',
        );
    if (request.strategy === 'surface-clear' && request.cutter !== 'flat')
        throw new Error(
            'Surface clearing requires a tool-library flat-bottom endmill.',
        );
    if (
        request.strategy !== 'surface-clear' &&
        request.cutter !== 'ball' &&
        request.cutter !== 'ballnose'
    )
        throw new Error(
            'Surface finishing requires a tool-library ball endmill.',
        );
    if (
        ![
            request.stock.widthMm,
            request.stock.heightMm,
            request.stock.thicknessMm,
        ].every((value) => Number.isFinite(value) && value > 0)
    )
        throw new Error(
            '3D CAM requires positive, finite job stock dimensions.',
        );
    if (!(request.safeZMm > request.stockTopZMm))
        throw new Error(
            'Safe Z must be above the job stock top before generating 3D surface moves.',
        );
    const radiusMm = request.toolDiameterMm / 2;
    if (
        mesh.bounds.minX - radiusMm - (request.boundaryMm ?? 0) <
            jobStockBounds(request.stock).minX ||
        mesh.bounds.minY - radiusMm - (request.boundaryMm ?? 0) <
            jobStockBounds(request.stock).minY ||
        mesh.bounds.maxX + radiusMm + (request.boundaryMm ?? 0) >
            jobStockBounds(request.stock).maxX ||
        mesh.bounds.maxY + radiusMm + (request.boundaryMm ?? 0) >
            jobStockBounds(request.stock).maxY
    )
        throw new Error(
            'STL, cutter, and boundary overrun do not fit inside job stock with the required edge clearance.',
        );
    if (
        mesh.bounds.minZ <
        request.stockTopZMm - request.stock.thicknessMm - 1e-5
    )
        throw new Error(
            'STL extends below the job stock bottom. Increase stock thickness or resize the model.',
        );
    const raster = await rasterizeSurface(
        request.boundaryMode === 'rectangle'
            ? rectangularSurfaceMesh(mesh, request.boundaryMm ?? 0)
            : mesh,
        request.resolutionMm,
        onProgress,
        signal,
    );
    throwIfSurfaceCamAborted(signal);
    const field = raster.field;
    const contact = await computeSurfaceContactHeights(
        field,
        request,
        onProgress,
        signal,
        request.strategy !== 'surface-waterline',
    );
    throwIfSurfaceCamAborted(signal);
    const generatedPaths =
        request.strategy === 'surface-clear'
            ? await buildClearingPathsAsync(
                  field,
                  contact.heights,
                  request,
                  signal,
                  onProgress,
                  contact.sampleRows,
              )
            : request.strategy === 'surface-waterline'
              ? await buildWaterlinePathsAsync(
                    field,
                    contact.heights,
                    request,
                    signal,
                    onProgress,
                )
              : await buildRasterPathsAsync(
                    field,
                    contact.heights,
                    request,
                    signal,
                    onProgress,
                    contact.sampleRows,
                );
    const boundaryPaths =
        request.strategy === 'surface-waterline' ||
        request.boundaryMode === 'rectangle'
            ? generatedPaths
            : applySurfaceBoundaryOverrun(generatedPaths, request.boundaryMm);
    // A ball tip can sit below a supported edge to touch it with its side.
    // Keep that compensation inside the physical stock; raising the tip leaves
    // material at the edge instead of cutting through the board. The input
    // mesh has already been validated against this same bottom plane.
    const bottomZ = request.stockTopZMm - request.stock.thicknessMm;
    const paths = boundaryPaths.map((path) =>
        path.map((point) =>
            point.z < bottomZ ? { ...point, z: bottomZ } : point,
        ),
    );
    validateSurfacePathsForStock(paths, request);
    return {
        strategy: request.strategy,
        paths,
        rows: field.rows,
        columns: field.columns,
        resolutionMm: field.cellSize,
        coveredCells: field.covered.reduce(
            (count, covered) => count + covered,
            0,
        ),
        computeBackend: contact.backend,
        rasterBackend: raster.backend,
    };
}
