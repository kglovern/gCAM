/**
 * Purpose: Implementation module for cam-ops in the react domain.
 */
import '../engine/clipper-shim.js';
import {
    clonePoint,
    pointAtDistance,
    polylineLength,
} from '../geometry/primitives.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import {
    ensureVCarveReady,
    getVCarveLoadError,
    generateVCarveToolpaths,
    isVCarveReady,
    mmPointsToClipperPath,
} from '../engine/vcarve.js';
import {
    crosshatchTextureContours as buildCrosshatchTextureContours,
    voronoiTextureContours as buildVoronoiTextureContours,
} from './texture-fill.js';
import {
    buildTabMarkerGeometry,
    findNearestPolylinePoint,
    getMinimumTabWidth as minimumTabWidth,
    getTabCenterlineSpan as tabCenterlineSpan,
    operationUsesTabs as supportsTabs,
    tabTopDepth as tabDepth,
} from './tabs.js';
import { formatNumber } from './gcode/format.js';
export { buildGcode, buildGcodeAsync } from './gcode/program.js';
export {
    crosshatchTextureContours,
    voronoiTextureContours,
} from './texture-fill.js';
import { buildPassDepths } from './operations/contract.js';
import { getOperation, getOperationLabel } from './operations/registry.js';
import {
    compositePocketSeedPaths,
    offsetCompositePolygons,
    polygonCentroid,
} from './geometry/polygons.js';
export {
    booleanPolygons,
    clipperPathFromPoints,
    compositePocketSeedPaths,
    ensureNegativeOrientation,
    ensurePositiveOrientation,
    offsetCompositePolygons,
    pointsFromClipperPath,
    polygonCentroid,
} from './geometry/polygons.js';

export function createToolpathFromLoops(selectedLoops, config, options = {}) {
    if (config.operation === 'vcarve') {
        throw new Error('V-Carve toolpaths must be built asynchronously.');
    }
    return createToolpathSkeleton(selectedLoops, config, options);
}

export async function createToolpathFromLoopsAsync(
    selectedLoops,
    config,
    options = {},
) {
    const toolpath = createToolpathSkeleton(selectedLoops, config, options);

    if (config.operation !== 'vcarve') {
        return toolpath;
    }

    const compositeSelection = compositePocketSeedPaths(selectedLoops);
    const vCarvePassDepth = Math.max(0.01, config.cutDepth);
    const motionPaths = await generateVCarveToolpaths(
        compositeSelection.map(mmPointsToClipperPath),
        {
            cutterAngle: config.cutterAngle,
            passDepth: vCarvePassDepth,
            maxDepth: config.cutDepth,
            onProgress: options.onProgress,
        },
    );

    toolpath.motionPaths = motionPaths;
    toolpath.previewContours = motionPaths
        .map((path) => path.points.map(({ x, y }) => ({ x, y })))
        .filter((points) => points.length >= 2);

    return toolpath;
}

function createToolpathSkeleton(selectedLoops, config, options = {}) {
    const reportProgress = options.onProgress || (() => {});
    const previewContours = [];
    const trochoidPreviewContours = [];
    const motionPaths = [];
    const operation = getOperation(config.operation);
    const bitmapEntity = (options.sourceEntities || []).find(
        (entity) => entity?.type === 'BITMAP' && entity._imageData,
    );
    const sampleBitmap = (bounds, x, y) => {
        const image = bitmapEntity?._imageData;
        if (!image || !bounds) return 0.5;
        const u = Math.min(
            image.width - 1,
            Math.max(
                0,
                Math.floor(
                    ((x - bounds.minX) /
                        Math.max(0.0001, bounds.maxX - bounds.minX)) *
                        image.width,
                ),
            ),
        );
        const v = Math.min(
            image.height - 1,
            Math.max(
                0,
                Math.floor(
                    ((bounds.maxY - y) /
                        Math.max(0.0001, bounds.maxY - bounds.minY)) *
                        image.height,
                ),
            ),
        );
        const i = (v * image.width + u) * 4;
        return (
            1 -
            (0.299 * image.data[i] +
                0.587 * image.data[i + 1] +
                0.114 * image.data[i + 2]) /
                255
        );
    };
    const addPreview = (points, intensity = 1) => {
        // Array metadata remains harmless to G-code but gives the canvas a
        // truthful visual weight for variable-power/depth raster segments.
        points._intensity = intensity;
        previewContours.push(points);
    };
    const sourceLoops = [];
    const operationServices = {
        clonePoint,
        offsetCompositePolygons,
        crosshatchTextureContours: buildCrosshatchTextureContours,
        voronoiTextureContours: buildVoronoiTextureContours,
        reportProgress,
        trochoidRadius: (value) => {
            const engagement = Math.min(
                40,
                Math.max(2, Number(value.trochoidEngagementPercent) || 10),
            );
            return value.trochoidEnabled
                ? Math.max(0, value.toolDiameter * (engagement / 100))
                : 0;
        },
        // Raster preview remains in this skeleton until its sampling and
        // preview geometry move together in the dedicated raster module.
        createRasterPreview: () => [],
    };
    operation.validate?.(config, {
        hasBitmap: Boolean(bitmapEntity),
        spot: (value) =>
            value.operation === 'wavy-raster'
                ? value.wavySpot || 2
                : value.laserSpot || 0.2,
    });
    // Shift the loop centerline by the trochoid radius so its inner sweep still
    // reaches the nominal profile boundary.
    const trochoidEngagementPercent = Math.min(
        40,
        Math.max(2, Number(config.trochoidEngagementPercent) || 10),
    );
    const trochoidRadius = operationServices.trochoidRadius(config);
    reportProgress(10, 'Preparing geometry');
    const isRasterOp =
        config.operation === 'laser-raster' ||
        config.operation === 'wavy-raster';
    const compositeSelection = isRasterOp
        ? []
        : compositePocketSeedPaths(selectedLoops);
    reportProgress(32, 'Combining shapes');

    if (
        config.operation === 'engrave' ||
        config.operation === 'chamfer' ||
        config.operation === 'laser-cut'
    ) {
        previewContours.push(
            ...operation.createPreview({
                selectedLoops,
                services: operationServices,
            }),
        );
    }
    for (const loop of selectedLoops) {
        if (
            config.operation === 'laser-raster' ||
            config.operation === 'wavy-raster' ||
            config.operation === 'halftone'
        ) {
            // for bitmap, loop is the bitmap bounds rect
            if (!loop.isBitmap) {
                if (config.operation !== 'halftone')
                    console.warn(
                        `[${config.operation}] skipping non-bitmap loop ${loop.id} isBitmap=${loop.isBitmap}`,
                    );
                continue;
            }
            const b = loop.bounds ||
                (loop.points ? boundsOfPoints(loop.points) : null) || {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 10,
                };
            if (
                !b ||
                !Number.isFinite(b.minX) ||
                !Number.isFinite(b.maxY) ||
                !Number.isFinite(b.maxX) ||
                !Number.isFinite(b.minY)
            )
                continue;
            if (config.operation === 'halftone') {
                // Use the very same pixel sampling as the V-bit output. The
                // preview is a field of real, variable-size holes, not SVG or
                // a uniform dot grid.
                const res = Math.max(
                    2,
                    Math.min(100, Number(config.halftoneResolution) || 25),
                );
                const w = b.maxX - b.minX,
                    h = b.maxY - b.minY;
                const cols = Math.round(res * (w / Math.max(w, h)));
                const rows = Math.round(res * (h / Math.max(w, h)));
                const sx = w / cols,
                    sy = h / rows;
                const maxRadius = Math.min(sx, sy) * 0.4;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = b.minX + (c + 0.5) * sx;
                        const y = b.minY + (r + 0.5) * sy;
                        const intensity = sampleBitmap(b, x, y);
                        const radius =
                            maxRadius *
                            (config.halftoneInvert ? 1 - intensity : intensity);
                        if (radius < 0.03) continue;
                        // generate circle preview (16 segments)
                        const pts = [];
                        for (let i = 0; i <= 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            pts.push({
                                x: x + Math.cos(a) * radius,
                                y: y + Math.sin(a) * radius,
                            });
                        }
                        addPreview(pts, Math.max(0.2, intensity));
                    }
                }
            } else {
                const spot =
                    config.operation === 'wavy-raster'
                        ? config.wavySpot || 2
                        : config.laserSpot || 0.2;
                const h = Math.max(0.1, b.maxY - b.minY);
                if (!Number.isFinite(h) || h <= 0) continue;
                const rows = Math.max(1, Math.ceil(h / spot));
                const cols = Math.max(
                    2,
                    Math.min(180, Math.ceil((b.maxX - b.minX) / spot)),
                );
                for (let r = 0; r < rows; r++) {
                    const y = b.minY + (r + 0.5) * spot;
                    if (y < b.minY || y > b.maxY) continue;
                    if (config.operation === 'wavy-raster') {
                        const points = [];
                        for (let c = 0; c <= cols; c++) {
                            const x = b.minX + (c / cols) * (b.maxX - b.minX);
                            const depth = sampleBitmap(b, x, y);
                            // A small on-canvas wave communicates the varying
                            // Z toolpath without falsifying its scan direction.
                            points.push({
                                x,
                                y:
                                    y +
                                    Math.sin(c * Math.PI) * depth * spot * 0.32,
                            });
                        }
                        addPreview(points, 0.9);
                    } else {
                        for (let c = 0; c < cols; c++) {
                            const x0 = b.minX + (c / cols) * (b.maxX - b.minX);
                            const x1 =
                                b.minX + ((c + 1) / cols) * (b.maxX - b.minX);
                            const intensity = sampleBitmap(b, (x0 + x1) / 2, y);
                            if (intensity < 0.015) continue;
                            addPreview(
                                [
                                    { x: x0, y },
                                    { x: x1, y },
                                ],
                                intensity,
                            );
                        }
                    }
                }
            }
        }
        sourceLoops.push(loop);
    }
    // for raster ops, ensure we have at least one preview contour even if above skipped
    if (
        (config.operation === 'laser-raster' ||
            config.operation === 'wavy-raster' ||
            config.operation === 'halftone') &&
        !previewContours.length
    ) {
        // fallback: use first loop's bounds
        const fb = selectedLoops[0]?.bounds || {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
        };
        previewContours.push([
            { x: fb.minX, y: fb.minY },
            { x: fb.maxX, y: fb.minY },
        ]);
    }

    if (
        config.operation === 'profile-outside' ||
        config.operation === 'profile-inside'
    ) {
        previewContours.push(
            ...operation.createPreview({
                config,
                compositeSelection,
                services: operationServices,
            }),
        );
        reportProgress(
            78,
            config.operation === 'profile-outside'
                ? 'Offsetting outside profile'
                : 'Offsetting inside profile',
        );
    }

    if (config.operation === 'pocket') {
        previewContours.push(
            ...operation.createPreview({
                config,
                compositeSelection,
                services: operationServices,
            }),
        );
    }

    // Sample orbit centers along the
    // contour, orient each orbit to the local tangent, and use the same
    // radius-based pitch as the emitted motion.
    if (
        trochoidRadius > 0 &&
        (config.operation === 'profile-outside' ||
            config.operation === 'profile-inside' ||
            config.operation === 'pocket')
    ) {
        const sourceContours = previewContours.slice();
        for (const contour of sourceContours) {
            if (contour.length < 2) continue;
            const total = polylineLength(contour);
            const orbitCount = Math.max(
                1,
                Math.ceil(total / Math.max(trochoidRadius * 0.7, 0.25)),
            );
            for (let orbit = 0; orbit <= orbitCount; orbit += 1) {
                const along = (total * orbit) / orbitCount;
                const center = pointAtDistance(contour, along);
                const before = pointAtDistance(
                    contour,
                    Math.max(0, along - trochoidRadius),
                );
                const after = pointAtDistance(
                    contour,
                    Math.min(total, along + trochoidRadius),
                );
                const tangentLength =
                    Math.hypot(after.x - before.x, after.y - before.y) || 1;
                const tx = (after.x - before.x) / tangentLength;
                const ty = (after.y - before.y) / tangentLength;
                const nx = -ty;
                const ny = tx;
                const circle = [];
                for (let step = 0; step <= 18; step += 1) {
                    const angle = (step / 18) * Math.PI * 2;
                    circle.push({
                        x:
                            center.x +
                            (nx * Math.cos(angle) + tx * Math.sin(angle)) *
                                trochoidRadius,
                        y:
                            center.y +
                            (ny * Math.cos(angle) + ty * Math.sin(angle)) *
                                trochoidRadius,
                    });
                }
                trochoidPreviewContours.push(circle);
            }
        }
    }

    if (config.operation === 'texture-fill') {
        previewContours.push(
            ...operation.createPreview({
                config,
                compositeSelection,
                services: operationServices,
            }),
        );
    }

    const cutDepth = Math.max(0.01, config.cutDepth);
    const passDepth = Math.max(0.01, config.passDepth);
    const passDepths = buildPassDepths(cutDepth, passDepth);

    const operationLabel = getOperationLabel(config.operation);

    if (config.operation === 'countersink') {
        const headDiameter = Number(config.countersinkHeadDiameterMm);
        const tolerance = Math.max(0.15, headDiameter * 0.03);
        for (const loop of selectedLoops) {
            if (!Array.isArray(loop.points) || loop.points.length < 13)
                throw new Error('V-bit countersink requires selected circles.');
            const center = polygonCentroid(loop.points || []);
            const radii = (loop.points || [])
                .slice(0, -1)
                .map((point) =>
                    Math.hypot(point.x - center.x, point.y - center.y),
                );
            if (radii.length < 12 || !radii.length)
                throw new Error('V-bit countersink requires selected circles.');
            const holeRadius =
                radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
            if (
                radii.some(
                    (radius) => Math.abs(radius - holeRadius) > tolerance,
                )
            )
                throw new Error(
                    'V-bit countersink only accepts circular hole geometry.',
                );
            if (headDiameter < holeRadius * 2 - tolerance)
                throw new Error(
                    'Screw head diameter must be at least as large as each selected hole.',
                );
            motionPaths.push({
                points: [
                    { x: center.x, y: center.y, z: 0 },
                    { x: center.x, y: center.y, z: -cutDepth },
                ],
            });
            const preview = [];
            for (let index = 0; index <= 48; index += 1) {
                const angle = (index / 48) * Math.PI * 2;
                preview.push({
                    x: center.x + (Math.cos(angle) * headDiameter) / 2,
                    y: center.y + (Math.sin(angle) * headDiameter) / 2,
                });
            }
            previewContours.push(preview);
        }
        if (!motionPaths.length)
            throw new Error(
                'Select one or more circular holes for countersinking.',
            );
    }

    const label =
        options.label ||
        `${operationLabel} (${selectedLoops.length} shape${selectedLoops.length === 1 ? '' : 's'})`;
    const chamferWidth =
        config.operation === 'chamfer' && Number.isFinite(config.cutterAngle)
            ? 2 * cutDepth * Math.tan((config.cutterAngle * Math.PI) / 360)
            : null;
    const trochoidMeta =
        config.trochoidEnabled &&
        (config.operation === 'profile-outside' ||
            config.operation === 'profile-inside' ||
            config.operation === 'pocket')
            ? ` - trochoid ${formatNumber(trochoidEngagementPercent)}% engagement`
            : '';
    const cardMeta =
        config.operation === 'vcarve'
            ? `${operationLabel} - T${config.toolNumber} - ${formatNumber(config.cutterAngle)}deg - ${formatNumber(cutDepth)}mm max depth - single pass`
            : config.operation === 'texture-fill'
              ? `${operationLabel} - T${config.toolNumber} - ${formatNumber(config.cutterAngle)}deg V-bit - ${config.textureType === 'crosshatch' ? `crosshatch ${formatNumber(config.textureSpacing || 5)}mm @ ${formatNumber(config.crosshatchAngle ?? 45)}deg` : `Voronoi ${formatNumber(config.textureSpacing || 5)}mm cells`} - ${formatNumber(cutDepth)}mm deep`
              : config.operation === 'chamfer'
                ? `${operationLabel} - T${config.toolNumber} - ${formatNumber(config.cutterAngle)}deg - ${formatNumber(cutDepth)}mm deep - ${passDepth.toFixed(2)}mm/pass - ${passDepths.length} passes${Number.isFinite(chamferWidth) ? ` - ${formatNumber(chamferWidth)}mm top width` : ''}`
                : `${operationLabel} - T${config.toolNumber} - ${config.toolDiameter.toFixed(1)}mm - ${cutDepth.toFixed(2)}mm deep - ${passDepth.toFixed(2)}mm/pass - ${passDepths.length} passes${trochoidMeta}`;

    reportProgress(96, 'Finalizing toolpath');

    // carry laser/wavy params forward for GCode
    const extra = {};
    if (
        config.operation === 'laser-raster' ||
        config.operation === 'laser-cut' ||
        config.operation === 'wavy-raster' ||
        config.operation === 'halftone'
    ) {
        extra.laserFeed = config.laserFeed || config.feedRate;
        extra.laserPower = config.laserPower || 1000;
        extra.laserSMin = config.laserSMin || 0;
        extra.laserSMax = config.laserSMax || 1000;
        extra.laserSpot = config.laserSpot || 0.2;
        extra.laserGamma = config.laserGamma || 1;
        extra.laserOverscan = Math.max(0, Number(config.laserOverscan) || 0);
        extra.wavyFeed = config.wavyFeed || config.feedRate;
        extra.wavySpot = config.wavySpot || 2;
        extra.wavyMinDepth = config.wavyMinDepth || 0;
        extra.wavyMaxDepth = config.wavyMaxDepth || 3;
        // keep source entities for bitmap raster access
        extra._sourceEntities = options.sourceEntities || null;
    }
    return {
        id: options.id || crypto.randomUUID(),
        label,
        operation: config.operation,
        emission: operation.emission,
        operationLabel,
        cardMeta:
            config.operation === 'laser-raster'
                ? `Laser Raster - ${selectedLoops.length} bitmaps - spot ${extra.laserSpot}mm`
                : config.operation === 'wavy-raster'
                  ? `Wavy - ${selectedLoops.length} bitmaps - ${extra.wavyMinDepth}→${extra.wavyMaxDepth}mm`
                  : config.operation === 'laser-cut'
                    ? `Laser Cut - ${selectedLoops.length} shapes`
                    : cardMeta,
        toolDiameter: config.toolDiameter,
        toolRadius: config.toolRadius,
        cutterAngle: config.cutterAngle,
        overlapPercent: config.overlapPercent,
        cutDepth,
        passDepth,
        passDepths,
        trochoidEnabled: Boolean(config.trochoidEnabled),
        trochoidRadius,
        trochoidEngagementPercent,
        helicalEntryEnabled: Boolean(config.helicalEntryEnabled),
        countersinkHeadDiameterMm:
            Number(config.countersinkHeadDiameterMm) || 0,
        tabWidth: config.tabWidth,
        tabHeight: config.tabHeight,
        safeZ: config.safeZ,
        feedRate: config.feedRate,
        plungeRate: config.plungeRate,
        spindle: config.spindle,
        toolNumber: config.toolNumber,
        libraryToolId: config.libraryToolId || null,
        libraryToolName: config.libraryToolName || '',
        libraryToolVendor: config.libraryToolVendor || '',
        libraryToolImage: config.libraryToolImage || '',
        libraryToolUrl: config.libraryToolUrl || '',
        libraryToolDescription: config.libraryToolDescription || '',
        previewContours,
        trochoidPreviewContours,
        motionPaths,
        sourceLoops,
        tabs: [],
        ...extra,
    };
}

export function nearestPointOnPolyline(points, target) {
    return findNearestPolylinePoint(points, target);
}

export function buildTabMarker(contour, alongDistance, width, transform) {
    return buildTabMarkerGeometry(contour, alongDistance, width, transform);
}

export function getMinimumTabWidth(toolDiameter) {
    return minimumTabWidth(toolDiameter);
}

export function getTabCenterlineSpan(tabWidth, toolDiameter) {
    return tabCenterlineSpan(tabWidth, toolDiameter);
}

export function operationUsesTabs(toolpath) {
    return supportsTabs(toolpath);
}

export function usesVCarve(operation) {
    return operation === 'vcarve';
}

export function isVCarveEngineReady() {
    return isVCarveReady();
}

export function ensureVCarveEngineReady() {
    return ensureVCarveReady();
}

export function getVCarveEngineLoadError() {
    return getVCarveLoadError();
}

export function tabTopDepth(toolpath) {
    return tabDepth(toolpath);
}
