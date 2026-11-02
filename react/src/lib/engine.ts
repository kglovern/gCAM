import type { LaserOptions } from '../toolpaths/toolpathRequest';
/**
 * Purpose: Implementation module for engine in the lib domain.
 */
import {
    booleanPolygons,
    buildGcode as buildRealGcode,
    buildGcodeAsync,
    createToolpathFromLoops,
    createToolpathFromLoopsAsync,
    offsetCompositePolygons,
} from '../cam/cam-ops.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import {
    createToolpathInWorker,
    buildGcodeInWorker,
    terminateWorker,
} from '../engine/cam-worker-client.ts';
import {
    assertToolpathRequest,
    makeToolpathConfig,
    prepareRasterInput,
} from '../toolpaths/toolpathRequest';
import type { ToolType } from '../tools/library';

export type Operation =
    | 'profile-outside'
    | 'profile-inside'
    | 'pocket'
    | 'engrave'
    | 'chamfer'
    | 'vcarve'
    | 'countersink'
    | 'texture-fill'
    | 'laser-fill'
    | 'laser-cut'
    | 'laser-raster'
    | 'wavy-raster'
    | 'halftone'
    | 'surface-clear'
    | 'surface-finish'
    | 'surface-waterline';

export interface PlacedTab {
    anchor?: { x: number; y: number };
    contourIndex: number;
    along: number;
}

export interface ProfileArgs {
    vCarvePairId?: string;
    vCarveClearingTool?: Pick<
        ProfileArgs,
        | 'toolDiameter'
        | 'toolNumber'
        | 'feedRate'
        | 'plungeRate'
        | 'spindle'
        | 'passDepth'
        | 'libraryToolId'
        | 'libraryToolName'
    >;
    vCarveInset?: { depth: number; angle: number; diameter: number };
    vCarveEdgeFinish?: boolean;
    chamferWidthMm?: number;
    chamferTipOffsetMm?: number;
    loops: {
        id?: string;
        groupId?: string;
        points: { x: number; y: number }[];
    }[];
    operation: Operation;
    toolDiameter: number;
    cutDepth: number;
    cutterAngle?: number;
    laserFeed?: number;
    laserPower?: number;
    laserSpot?: number;
    laserSMin?: number;
    laserSMax?: number;
    laserGamma?: number;
    laserOptions?: LaserOptions;
    laserOverscan?: number;
    wavySpot?: number;
    wavyMinDepth?: number;
    wavyMaxDepth?: number;
    wavyFeed?: number;
    halftoneResolution?: number;
    halftoneInvert?: boolean;
    textureType?: 'voronoi' | 'crosshatch';
    textureSpacing?: number;
    crosshatchAngle?: number;
    /** Material and machine used to calculate this toolpath's saved recipe. */
    material?: string;
    /** Job-stock thickness at generation time, used for replay/export context. */
    stockThicknessMm?: number;
    cutterType?: ToolType;
    machineProfileId?: string;
    /** Emit G2/G3 arcs for circles (default) or G1-only polylines. */
    arcs?: boolean;
    feedRate?: number;
    plungeRate?: number;
    spindle?: number;
    safeZ?: number;
    passDepth?: number;
    trochoidEnabled?: boolean;
    trochoidEngagementPercent?: number;
    helicalEntryEnabled?: boolean;
    overlapPercent?: number;
    tabWidth?: number;
    tabHeight?: number;
    toolNumber?: number;
    tabs?: PlacedTab[];
    fileName?: string;
    libraryToolId?: string;
    libraryToolName?: string;
    surfaceBitmapId?: string;
    surfaceResolutionMm?: number;
    surfaceStepoverMm?: number;
    surfaceStepdownMm?: number;
    surfaceStockToLeaveMm?: number;
    surfaceBoundaryMm?: number;
    surfaceBoundaryMode?: 'model' | 'rectangle';
    countersinkHeadDiameterMm?: number;
}

export interface ToolpathResult {
    clearing?: { result: ToolpathResult; args: ProfileArgs };
    gcode: string;
    previewContours: { x: number; y: number }[][];
    trochoidPreviewContours?: { x: number; y: number }[][];
    label: string;
    toolpath: Record<string, unknown>;
}

/** Package WebGPU-generated XYZ paths for the shared preview and GRBL pipeline. */
export function buildSurfaceToolpathResult(options: {
    operation: 'surface-clear' | 'surface-finish' | 'surface-waterline';
    paths: { x: number; y: number; z: number }[][];
    toolDiameter: number;
    cutterType: ToolType;
    libraryToolId?: string;
    libraryToolName?: string;
    toolNumber: number;
    feedRate: number;
    plungeRate: number;
    spindle: number;
    safeZ: number;
    stepdown: number;
    stockToLeave: number;
    surfaceBitmapId: string;
    fileName?: string;
}): ToolpathResult {
    const clearing = options.operation === 'surface-clear';
    const label = clearing
        ? '3D Surface Clearing'
        : options.operation === 'surface-waterline'
          ? '3D Waterline Finishing'
          : '3D Surface Finishing';
    const motionPaths = options.paths.map((points) => ({
        points: points.map((point) => ({ ...point })),
    }));
    const previewContours = motionPaths.map(({ points }) =>
        points.map(({ x, y }) => ({ x, y })),
    );
    const toolpath = {
        operation: options.operation,
        surfaceTip: options.operation !== 'surface-clear',
        operationLabel: label,
        emission: 'vcarve',
        label,
        cutterType: options.cutterType,
        libraryToolId: options.libraryToolId,
        libraryToolName: options.libraryToolName,
        toolDiameter: options.toolDiameter,
        toolNumber: options.toolNumber,
        feedRate: options.feedRate,
        plungeRate: options.plungeRate,
        spindle: options.spindle,
        safeZ: options.safeZ,
        cutDepth: options.stepdown,
        passDepth: options.stepdown,
        passDepths: [],
        stockToLeaveMm: options.stockToLeave,
        surfaceBitmapId: options.surfaceBitmapId,
        motionPaths,
        previewContours,
    };
    const gcode = buildRealGcode({
        toolpaths: [toolpath],
        fileName: options.fileName || 'gcam-surface',
        forcePolylineArcs: true,
    });
    return { gcode, previewContours, label, toolpath };
}

/**
 * Real toolpath pipeline: Clipper offset/pocket via cam-ops plus the real
 * GRBL emitter. Returns preview contours for canvas overlay.
 */
export interface RasterBitmap {
    rotation?: number;
    imageData: {
        width: number;
        height: number;
        data: ArrayLike<number>;
    };
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Shared toolpath config defaults (cam-ops requires finite toolRadius,
 * overlapPercent, tabWidth/tabHeight and toolNumber). Used by both the
 * sync and worker build paths so they behave identically.
 */
function makeBase(
    operation: Operation,
    c: {
        toolDiameter: number;
        cutDepth: number;
        cutterAngle?: number;
        laserFeed?: number;
        laserPower?: number;
        laserSpot?: number;
        laserSMin?: number;
        laserSMax?: number;
        laserGamma?: number;
        laserOptions?: LaserOptions;
        laserOverscan?: number;
        wavySpot?: number;
        wavyMinDepth?: number;
        wavyMaxDepth?: number;
        wavyFeed?: number;
        halftoneResolution?: number;
        halftoneInvert?: boolean;
        textureType?: 'voronoi' | 'crosshatch';
        textureSpacing?: number;
        crosshatchAngle?: number;
        feedRate?: number;
        plungeRate?: number;
        spindle?: number;
        safeZ?: number;
        passDepth?: number;
        trochoidEnabled?: boolean;
        trochoidEngagementPercent?: number;
        helicalEntryEnabled?: boolean;
        countersinkHeadDiameterMm?: number;
        overlapPercent?: number;
        tabWidth?: number;
        tabHeight?: number;
        toolNumber?: number;
    },
) {
    const {
        toolDiameter,
        cutDepth,
        cutterAngle = 90,
        laserFeed = 3000,
        laserPower = 1000,
        laserSpot = 0.2,
        laserSMin = 0,
        laserSMax = 1000,
        laserGamma = 1,
        laserOptions,
        laserOverscan = 2,
        wavySpot = 2,
        wavyMinDepth = 0,
        wavyMaxDepth = 3,
        wavyFeed,
        halftoneResolution = 50,
        halftoneInvert = false,
        textureType = 'voronoi',
        textureSpacing = 5,
        crosshatchAngle = 45,
        feedRate = 1800,
        plungeRate = 600,
        spindle = 18000,
        safeZ = 5,
        passDepth,
        trochoidEnabled = false,
        trochoidEngagementPercent = 10,
        helicalEntryEnabled = false,
        countersinkHeadDiameterMm = 8,
        overlapPercent = 40,
        tabWidth = 9,
        tabHeight = Math.min(9, cutDepth / 2),
        toolNumber = 1,
    } = c;
    return {
        operation,
        toolDiameter,
        toolRadius: toolDiameter / 2,
        cutterAngle,
        overlapPercent,
        cutDepth,
        passDepth: passDepth ?? cutDepth,
        trochoidEnabled,
        trochoidRadius: trochoidEnabled
            ? Math.max(0, toolDiameter * (trochoidEngagementPercent / 100))
            : 0,
        trochoidEngagementPercent,
        helicalEntryEnabled,
        countersinkHeadDiameterMm,
        tabWidth,
        tabHeight,
        safeZ,
        feedRate:
            operation === 'laser-cut' || operation === 'laser-raster'
                ? laserFeed
                : feedRate,
        plungeRate,
        spindle,
        toolNumber: Math.max(1, Math.round(toolNumber)),
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        laserOptions,
        laserOverscan,
        wavySpot,
        wavyMinDepth,
        wavyMaxDepth,
        wavyFeed: wavyFeed ?? feedRate,
        halftoneResolution,
        halftoneInvert,
        textureType,
        textureSpacing,
        crosshatchAngle,
    };
}

export function buildToolpathGcode({
    vCarveInset,
    vCarvePairId,
    vCarveEdgeFinish,
    loops,
    operation,
    toolDiameter,
    cutDepth,
    cutterAngle = 90,
    chamferWidthMm,
    chamferTipOffsetMm,
    stockThicknessMm,
    laserFeed = 3000,
    laserPower = 1000,
    laserSpot = 0.2,
    laserSMin = 0,
    laserSMax = 1000,
    laserGamma = 1,
    laserOptions,
    laserOverscan = 2,
    wavySpot = 2,
    wavyMinDepth = 0,
    wavyMaxDepth = 3,
    wavyFeed,
    halftoneResolution = 50,
    halftoneInvert = false,
    textureType = 'voronoi',
    textureSpacing = 5,
    crosshatchAngle = 45,
    arcs = true,
    tabs = [],
    fileName,
    trochoidEnabled = false,
    trochoidEngagementPercent = 10,
    helicalEntryEnabled = false,
    countersinkHeadDiameterMm = 8,
    feedRate = 1800,
    plungeRate = 600,
    spindle = 18000,
    safeZ = 5,
    passDepth,
    overlapPercent,
    tabWidth,
    tabHeight,
    toolNumber,
    libraryToolName,
    bitmap,
}: ProfileArgs & { bitmap?: RasterBitmap }): Promise<ToolpathResult> {
    if (!loops.length) return Promise.reject(new Error('No shapes selected.'));
    if (operation === 'laser-raster' && !bitmap)
        return Promise.reject(
            new Error('Laser Raster needs a bitmap — import an image first.'),
        );
    if (operation === 'wavy-raster' && !bitmap)
        return Promise.reject(
            new Error('Wavy needs a bitmap — import an image first.'),
        );
    if (operation === 'halftone' && !bitmap)
        return Promise.reject(
            new Error('Halftone needs a bitmap — import an image first.'),
        );
    if (!(toolDiameter > 0))
        return Promise.reject(
            new Error('Tool diameter must be greater than zero.'),
        );
    if (!(cutDepth > 0))
        return Promise.reject(
            new Error('Cut depth must be greater than zero.'),
        );
    assertToolpathRequest({ operation, toolDiameter, cutDepth }, bitmap);
    const base = makeToolpathConfig({
        vCarveInset,
        vCarvePairId,
        vCarveEdgeFinish,
        laserManualTabs: operation === 'laser-cut' ? tabs : undefined,
        operation,
        toolDiameter,
        cutDepth,
        cutterAngle,
        chamferWidthMm,
        chamferTipOffsetMm,
        stockThicknessMm,
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        laserOptions,
        laserOverscan,
        wavySpot,
        wavyMinDepth,
        wavyMaxDepth,
        wavyFeed,
        halftoneResolution,
        halftoneInvert,
        textureType,
        textureSpacing,
        crosshatchAngle,
        feedRate,
        plungeRate,
        spindle,
        safeZ,
        passDepth,
        trochoidEnabled,
        trochoidEngagementPercent,
        helicalEntryEnabled,
        countersinkHeadDiameterMm,
        overlapPercent,
        tabWidth,
        tabHeight,
        toolNumber,
        libraryToolName,
    });
    // Raster ops sample bitmap pixels: flag the loop and hand the entity over.
    const raster = prepareRasterInput(loops, operation, bitmap);
    const withTabs = <T extends object>(toolpath: T): T => {
        (toolpath as { tabs?: PlacedTab[] }).tabs = tabs.map((t) => ({
            ...t,
        }));
        // Halftone reads these off the toolpath at emit time.
        (toolpath as { halftoneResolution?: number }).halftoneResolution =
            halftoneResolution;
        (toolpath as { halftoneInvert?: boolean }).halftoneInvert =
            halftoneInvert;
        return toolpath;
    };
    if (operation === 'vcarve') {
        return createToolpathFromLoopsAsync(raster.loops, base).then(
            (toolpath) => finishToolpath(fileName, withTabs(toolpath), arcs),
        );
    }
    try {
        return Promise.resolve(
            finishToolpath(
                fileName,
                withTabs(
                    createToolpathFromLoops(raster.loops, base, raster.options),
                ),
                arcs,
            ),
        );
    } catch (e) {
        return Promise.reject(e);
    }
}

function finishToolpath(
    fileName: string | undefined,
    toolpath: {
        previewContours: { x: number; y: number }[][];
        trochoidPreviewContours?: { x: number; y: number }[][];
        label: string;
    },
    arcs = true,
): ToolpathResult {
    const gcode = buildRealGcode({
        toolpaths: [toolpath],
        fileName: fileName || 'gcam',
        forcePolylineArcs: !arcs,
    });
    return {
        gcode,
        previewContours: toolpath.previewContours,
        trochoidPreviewContours: toolpath.trochoidPreviewContours ?? [],
        label: toolpath.label,
        toolpath: toolpath as unknown as Record<string, unknown>,
    };
}

export type BooleanOperation = 'union' | 'difference' | 'intersection' | 'xor';

/** Boolean-combine loop point sets via Clipper. Throws when <2 inputs. */
export function applyBoolean(
    loops: { points: { x: number; y: number }[] }[],
    operation: BooleanOperation,
): { points: { x: number; y: number }[] }[] {
    const results: { x: number; y: number }[][] = booleanPolygons(
        loops,
        operation,
    );
    if (!results.length) throw new Error('The shapes produced no result.');
    return results.map((points) => ({ points }));
}

/** Offset loop geometry outward (+) or inward (−) by mm via Clipper. */
export function offsetLoops(
    loops: { points: { x: number; y: number }[] }[],
    delta: number,
): { points: { x: number; y: number }[] }[] {
    if (!Number.isFinite(delta) || delta === 0)
        throw new Error('Offset must be a non-zero number.');
    const results: { x: number; y: number }[][] = offsetCompositePolygons(
        loops.map((l) => l.points),
        delta,
    );
    if (!results.length) throw new Error('Offset produced no geometry.');
    return results.map((points) => ({ points }));
}

/** Combine stored toolpaths into one GRBL program, like legacy Step 3. */
export function combineToolpaths(
    toolpaths: Record<string, unknown>[],
    fileName = 'gcam',
    arcs = true,
): string {
    if (!toolpaths.length) return '';
    return buildRealGcode({
        toolpaths: toolpaths as never,
        fileName,
        forcePolylineArcs: !arcs,
    });
}

/** Async version that offloads toolpath computation to a Web Worker. */
export async function buildToolpathGcodeAsync(
    args: ProfileArgs & {
        bitmap?: RasterBitmap;
        /** Geometry consumers can defer program emission to the final job export. */
        geometryOnly?: boolean;
        onProgress?: (percent: number, label: string) => void;
        signal?: AbortSignal;
    },
): Promise<ToolpathResult> {
    if (args.operation === 'vcarve' && args.vCarveClearingTool) {
        const { vCarveClearingTool: tool, ...finishing } = args;
        if (
            !Number.isInteger(tool.toolNumber) ||
            !(Number(tool.toolNumber) > 0) ||
            tool.toolNumber === args.toolNumber ||
            !(tool.toolDiameter > 0)
        )
            throw new Error('Choose a separate flat endmill for clearing.');
        if (
            !(args.cutDepth > 0) ||
            !args.stockThicknessMm ||
            args.cutDepth >= args.stockThicknessMm
        )
            throw new Error(
                'V-carve clearing depth must be above the bottom of the stock.',
            );
        const clearingArgs: ProfileArgs = {
            loops: args.loops,
            operation: 'pocket',
            ...tool,
            cutterType: 'flat',
            cutDepth: args.cutDepth,
            stockThicknessMm: args.stockThicknessMm,
            material: args.material,
            machineProfileId: args.machineProfileId,
            safeZ: args.safeZ,
            arcs: args.arcs,
            tabHeight: 0,
            overlapPercent: 50,
            vCarvePairId: args.vCarvePairId,
            vCarveInset: {
                depth: args.cutDepth,
                angle: args.cutterAngle ?? 90,
                diameter: args.toolDiameter,
            },
        };
        const clearing = await buildToolpathGcodeAsync({
            ...clearingArgs,
            signal: args.signal,
            geometryOnly: args.geometryOnly,
            onProgress: args.onProgress,
        });
        if (!clearing.previewContours.length)
            throw new Error(
                'The clearing endmill does not fit. Choose a smaller endmill or reduce depth.',
            );
        clearing.label = 'V-carve clearing';
        clearing.toolpath.label = clearing.label;
        const result = await buildToolpathGcodeAsync({
            ...finishing,
            vCarveEdgeFinish: true,
        });
        result.clearing = { result: clearing, args: clearingArgs };
        return result;
    }
    const {
        loops,
        operation,
        arcs = true,
        fileName,
        bitmap,
        onProgress,
        signal,
        geometryOnly = false,
        halftoneResolution = 50,
        halftoneInvert = false,
        tabs = [],
        ...config
    } = args;

    if (signal?.aborted)
        throw new DOMException('Laser build cancelled.', 'AbortError');
    if (!loops.length) throw new Error('No shapes selected.');
    assertToolpathRequest({ operation, ...config }, bitmap);

    // Prepare raster data for bitmap operations
    const raster = prepareRasterInput(loops, operation, bitmap);

    // Wrap onProgress to match worker client signature
    const workerProgress = onProgress
        ? (p: { percent: number; label: string }) =>
              onProgress(p.percent, p.label)
        : undefined;

    const base = makeToolpathConfig({
        laserManualTabs: operation === 'laser-cut' ? tabs : undefined,
        operation,
        ...config,
        halftoneResolution,
        halftoneInvert,
    });

    const toolpath = await createToolpathInWorker(
        raster.loops,
        { ...base, ...raster.options },
        {
            onProgress:
                operation.startsWith('laser-') && onProgress && !geometryOnly
                    ? (p) => onProgress(p.percent * 0.85, p.label)
                    : workerProgress,
            signal,
            validateResult: geometryOnly,
        },
    );

    // Apply tabs after worker returns
    if (tabs.length) {
        toolpath.tabs = tabs.map((t) => ({ ...t }));
    }
    if (operation === 'halftone') {
        toolpath.halftoneResolution = halftoneResolution;
        toolpath.halftoneInvert = halftoneInvert;
    }

    // Build G-code in worker
    const gcode = geometryOnly
        ? ''
        : await buildGcodeInWorker({
              toolpaths: [toolpath],
              fileName: fileName || 'gcam',
              forcePolylineArcs: !arcs,
              onProgress:
                  operation.startsWith('laser-') && onProgress
                      ? (p) => onProgress(85 + p.percent * 0.15, p.label)
                      : workerProgress,
              signal,
          });

    if (geometryOnly) onProgress?.(100, 'Toolpath ready');
    return {
        gcode,
        previewContours: toolpath.previewContours,
        trochoidPreviewContours: toolpath.trochoidPreviewContours ?? [],
        label: toolpath.label,
        toolpath: toolpath as unknown as Record<string, unknown>,
    };
}

/** Async version of combineToolpaths that offloads to Web Worker. */
export async function combineToolpathsAsync(
    toolpaths: Record<string, unknown>[],
    fileName = 'gcam',
    arcs = true,
    onProgress?: (percent: number, label: string) => void,
): Promise<string> {
    if (!toolpaths.length) return '';
    const workerProgress = onProgress
        ? (p: { percent: number; label: string }) =>
              onProgress(p.percent, p.label)
        : undefined;
    return buildGcodeInWorker({
        toolpaths: toolpaths as any[],
        fileName,
        forcePolylineArcs: !arcs,
        onProgress: workerProgress,
    });
}

/** Terminate the CAM worker (call on app unload). */
export { terminateWorker };
export function buildProfileGcode(
    args: Omit<ProfileArgs, 'operation'>,
): Promise<string> {
    return buildToolpathGcode({ ...args, operation: 'profile-outside' }).then(
        (r) => r.gcode,
    );
}

export function loopBounds(loops: ProfileArgs['loops']) {
    if (!loops.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const loop of loops) {
        if (loop.points.length < 2) continue;
        const b = boundsOfPoints(loop.points);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
