export interface LaserOptions {
    powerMode?: 'profile' | 'dynamic' | 'constant';
    passThrough?: boolean;
    hatchOverscan?: boolean;
    scanAlignment?: {
        enabled: boolean;
        measurements: { feed: number; gap: number }[];
    };
    passes?: number;
    kerf?: number;
    overcut?: number;
    leadInLength?: number;
    leadOutLength?: number;
    leadInAngle?: number;
    leadOutAngle?: number;
    perforation?: boolean;
    perforationCut?: number;
    perforationSkip?: number;
    bridges?: boolean;
    bridgeMode?: 'automatic' | 'manual';
    bridgeCount?: number;
    bridgePlacement?: 'count' | 'spacing';
    bridgeSpacing?: number;
    bridgeLimit?: boolean;
    bridgeMax?: number;
    bridgeWidth?: number;
    /** Fraction of the cutting power; zero leaves an uncut bridge. */
    bridgePower?: number;
    bridgeSkipInner?: boolean;
    fillAngle?: number;
    fillMode?: 'hatch' | 'offset';
    fillSequence?: 'all' | 'individual' | 'groups';
    crosshatch?: boolean;
    bidirectional?: boolean;
    scanAngle?: number;
    angleIncrement?: number;
    trimBlank?: boolean;
    imageCrop?: { left: number; bottom: number; right: number; top: number };
    maskSourceIds?: string[];
    imageMask?: { x: number; y: number }[][];
    imageMode?:
        | 'grayscale'
        | 'threshold'
        | 'ordered'
        | 'floyd-steinberg'
        | 'atkinson'
        | 'jarvis'
        | 'stucki'
        | 'halftone'
        | 'edge';
    threshold?: number;
    halftoneCellSize?: number;
    halftoneAngle?: number;
    edgeGain?: number;
    invert?: boolean;
    brightness?: number;
    contrast?: number;
    grayscale?:
        | 'luminance'
        | 'average'
        | 'red'
        | 'green'
        | 'blue'
        | 'minimum'
        | 'maximum';
    shadeCount?: number;
    smoothing?: number;
    sharpening?: number;
    filterRadius?: number;
    sharpeningDenoise?: number;
    dotWidthCorrection?: number;
    innerFirst?: boolean;
    optimizeTravel?: boolean;
    preferCornerStarts?: boolean;
    cutOrder?:
        | 'none'
        | 'left-to-right'
        | 'right-to-left'
        | 'top-to-bottom'
        | 'bottom-to-top';
    removeSharedCuts?: boolean;
    airAssist?: boolean;
}
/**
 * Purpose: Implementation module for toolpathRequest in the react domain.
 */
/**
 * Request normalization shared by synchronous and worker CAM entry points.
 * This module deliberately knows nothing about React, workers, or G-code.
 */
export type BitmapImage = {
    width: number;
    height: number;
    data: ArrayLike<number>;
};

export type RasterBitmapInput = {
    imageData: BitmapImage;
    rotation?: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type ToolpathRequest = {
    laserManualTabs?: {
        contourIndex: number;
        along: number;
        anchor?: { x: number; y: number };
    }[];
    operation: string;
    toolDiameter: number;
    cutDepth: number;
    chamferWidthMm?: number;
    vCarveInset?: { depth: number; angle: number; diameter: number };
    vCarveEdgeFinish?: boolean;
    vCarvePairId?: string;
    chamferTipOffsetMm?: number;
    stockThicknessMm?: number;
    cutterAngle?: number;
    laserFeed?: number;
    laserPower?: number;
    laserSpot?: number;
    laserSMin?: number;
    laserSMax?: number;
    laserGamma?: number;
    laserOverscan?: number;
    laserOptions?: LaserOptions;
    wavySpot?: number;
    wavyMinDepth?: number;
    wavyMaxDepth?: number;
    wavyFeed?: number;
    halftoneResolution?: number;
    halftoneInvert?: boolean;
    textureType?: 'voronoi' | 'crosshatch';
    textureSpacing?: number;
    /** Crosshatch line angle in degrees; the second pass is perpendicular. */
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
    libraryToolName?: string;
};

export function assertToolpathRequest(
    request: Pick<ToolpathRequest, 'operation' | 'toolDiameter' | 'cutDepth'>,
    bitmap?: RasterBitmapInput,
) {
    const needsBitmap = ['laser-raster', 'wavy-raster', 'halftone'].includes(
        request.operation,
    );
    if (needsBitmap && !bitmap) {
        const names: Record<string, string> = {
            'laser-raster': 'Laser Raster',
            'wavy-raster': 'Wavy',
            halftone: 'Halftone',
        };
        throw new Error(
            `${names[request.operation]} needs a bitmap — import an image first.`,
        );
    }
    if (!(request.toolDiameter > 0)) {
        throw new Error('Tool diameter must be greater than zero.');
    }
    if (!(request.cutDepth > 0)) {
        throw new Error('Cut depth must be greater than zero.');
    }
}

export function makeToolpathConfig(request: ToolpathRequest) {
    const {
        operation,
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
        libraryToolName = '',
    } = request;
    return {
        ...(request.vCarveInset ? { vCarveInset: request.vCarveInset } : {}),
        ...(request.vCarveEdgeFinish ? { vCarveEdgeFinish: true } : {}),
        ...(request.vCarvePairId ? { vCarvePairId: request.vCarvePairId } : {}),
        ...(request.laserManualTabs?.length
            ? { laserManualTabs: request.laserManualTabs }
            : {}),
        operation,
        toolDiameter,
        toolRadius: toolDiameter / 2,
        ...(operation === 'chamfer' &&
        request.chamferWidthMm !== undefined &&
        request.stockThicknessMm !== undefined
            ? { stockThicknessMm: request.stockThicknessMm }
            : {}),
        ...(operation === 'chamfer' && request.chamferWidthMm !== undefined
            ? {
                  chamferWidthMm: request.chamferWidthMm,
                  chamferTipOffsetMm: request.chamferTipOffsetMm ?? 0,
              }
            : {}),
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
        libraryToolName,
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

export function prepareRasterInput<
    T extends { points: { x: number; y: number }[] },
>(loops: T[], operation: string, bitmap?: RasterBitmapInput) {
    const isRaster = ['laser-raster', 'wavy-raster', 'halftone'].includes(
        operation,
    );
    if (!isRaster || !bitmap) return { loops, options: {} };
    return {
        loops: loops.map((loop) => ({
            ...loop,
            isBitmap: true,
            bounds: bitmap.bounds,
        })),
        options: {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    _imageData: bitmap.imageData,
                    rotation: bitmap.rotation,
                    bounds: bitmap.bounds,
                },
            ],
        },
    };
}
