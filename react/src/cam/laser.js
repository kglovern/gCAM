import { manualLaserBridges, resolveManualLaserTabs } from './laser-bridges.js';
import { joinHatchRuns } from './hatch-runs.js';
import { artworkFillGroups } from './laser-fill-groups.js';
import { removeSharedLaserCuts } from './laser-shared-cuts.js';
import { laserLeadEndpoints } from './laser-leads.js';
import { laserOvercutPoints } from './laser-overcut.js';
import { createHalftoneScreen } from './halftone.js';
import { correctLaserDots } from './laser-dot-width.js';
import {
    imageLightness,
    createImageLightnessSampler,
} from './image-lightness.js';
import {
    FULL_IMAGE,
    resolveImageCrop,
    validateImageRegion,
    validateImageMaskSources,
    scanIntervals,
    intersectIntervals,
} from './raster-region.js';
import {
    compositePocketSeedPaths,
    compositePocketGeometry,
    groupCompositePolygons,
    offsetCompositePolygons,
} from './geometry/polygons.js';
import { orderLaserCuts } from './laser-order.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import {
    DEFAULT_SCAN_ALIGNMENT,
    validateScanAlignment,
    alignScanPaths,
    overscanFillPaths,
    scanAlignmentApplies,
} from './scan-alignment.js';

export const LASER_DEFAULTS = {
    passes: 1,
    powerMode: 'profile',
    passThrough: false,
    kerf: 0,
    overcut: 0,
    leadInLength: 0,
    leadOutLength: 0,
    leadInAngle: 45,
    leadOutAngle: 45,
    perforation: false,
    perforationCut: 2,
    perforationSkip: 1,
    bridges: false,
    bridgeMode: 'automatic',
    bridgeCount: 4,
    bridgePlacement: 'count',
    bridgeSpacing: 25,
    bridgeLimit: false,
    bridgeMax: 100,
    bridgeWidth: 0.5,
    bridgePower: 0,
    bridgeSkipInner: true,
    fillAngle: 0,
    fillMode: 'hatch',
    fillSequence: 'all',
    crosshatch: false,
    bidirectional: true,
    scanAngle: 0,
    angleIncrement: 0,
    trimBlank: true,
    imageCrop: FULL_IMAGE,
    imageMask: [],
    maskSourceIds: [],
    imageMode: 'grayscale',
    halftoneCellSize: 1,
    halftoneAngle: 45,
    edgeGain: 1,
    threshold: 0.5,
    invert: false,
    brightness: 0,
    contrast: 1,
    grayscale: 'luminance',
    shadeCount: 0,
    smoothing: 0,
    sharpening: 0,
    filterRadius: 1,
    sharpeningDenoise: 0,
    dotWidthCorrection: 0,
    innerFirst: true,
    optimizeTravel: true,
    cutOrder: 'none',
    preferCornerStarts: false,
    removeSharedCuts: false,
    airAssist: false,
    hatchOverscan: true,
    scanAlignment: DEFAULT_SCAN_ALIGNMENT,
};
const LIMIT = 1000000;
export function laserOptions(input = {}) {
    const o = { ...LASER_DEFAULTS, ...input };
    validateImageMaskSources(o.maskSourceIds);
    for (const [key, min, max] of [
        ['passes', 1, 100],
        ['kerf', -10, 10],
        ['overcut', 0, 10000],
        ['leadInLength', 0, 10000],
        ['leadOutLength', 0, 10000],
        ['leadInAngle', -180, 180],
        ['leadOutAngle', -180, 180],
        ['perforationCut', 0.001, 100000],
        ['perforationSkip', 0.001, 100000],
        ['bridgeCount', 1, 100],
        ['bridgeSpacing', 0.01, 100000],
        ['bridgeMax', 1, 10000],
        ['bridgeWidth', 0.001, 100],
        ['bridgePower', 0, 1],
        ['fillAngle', -360, 360],
        ['scanAngle', -360, 360],
        ['angleIncrement', -360, 360],
        ['threshold', 0, 1],
        ['brightness', -1, 1],
        ['contrast', 0.1, 5],
        ['shadeCount', 0, 256],
        ['halftoneCellSize', 0.01, 100],
        ['halftoneAngle', -360, 360],
        ['edgeGain', 0.1, 10],
        ['smoothing', 0, 1],
        ['sharpening', 0, 2],
        ['filterRadius', 1, 16],
        ['sharpeningDenoise', 0, 1],
        ['dotWidthCorrection', 0, 10],
    ]) {
        if (!Number.isFinite(o[key]) || o[key] < min || o[key] > max)
            throw new Error(`Invalid laser ${key}.`);
    }
    if (!Number.isInteger(o.filterRadius))
        throw new Error('Invalid laser filterRadius.');
    if (
        ![
            'luminance',
            'average',
            'red',
            'green',
            'blue',
            'minimum',
            'maximum',
        ].includes(o.grayscale) ||
        (o.shadeCount !== 0 &&
            (!Number.isInteger(o.shadeCount) || o.shadeCount < 2))
    )
        throw new Error('Invalid grayscale or shade count.');
    if (
        !['automatic', 'manual'].includes(o.bridgeMode) ||
        !['count', 'spacing'].includes(o.bridgePlacement) ||
        !Number.isInteger(o.bridgeMax)
    )
        throw new Error('Invalid laser bridge placement or maximum.');
    if (!['all', 'individual', 'groups'].includes(o.fillSequence))
        throw new Error('Invalid laser fill sequence.');
    if (
        ![
            'none',
            'left-to-right',
            'right-to-left',
            'top-to-bottom',
            'bottom-to-top',
        ].includes(o.cutOrder)
    )
        throw new Error('Invalid laser cut order.');
    if (!['profile', 'dynamic', 'constant'].includes(o.powerMode))
        throw new Error('Invalid laser power control.');
    if (!Number.isInteger(o.bridgeCount))
        throw new Error('Laser bridge count must be a whole number.');
    if (!Number.isInteger(o.passes))
        throw new Error('Laser passes must be a whole number.');
    if (
        !['hatch', 'offset'].includes(o.fillMode) ||
        ![
            'grayscale',
            'threshold',
            'ordered',
            'floyd-steinberg',
            'atkinson',
            'jarvis',
            'stucki',
            'halftone',
            'edge',
        ].includes(o.imageMode)
    )
        throw new Error('Unsupported laser processing mode.');
    for (const key of [
        'perforation',
        'bridgeLimit',
        'bridges',
        'bridgeSkipInner',
        'passThrough',
        'trimBlank',
        'crosshatch',
        'bidirectional',
        'invert',
        'innerFirst',
        'optimizeTravel',
        'preferCornerStarts',
        'removeSharedCuts',
        'airAssist',
        'hatchOverscan',
    ])
        if (typeof o[key] !== 'boolean')
            throw new Error(`Invalid laser ${key}.`);
    validateImageRegion(o.imageCrop, o.imageMask);
    o.scanAlignment = validateScanAlignment(o.scanAlignment);
    return o;
}
const closeEnough = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
const closed = (p) => p.length >= 4 && closeEnough(p[0], p[p.length - 1]);
const point = (x, y, power) => ({ x, y, power });

export function hatchPaths(
    polygons,
    spacing,
    angle,
    bidirectional = true,
    scanOrigin,
    pointBudget = LIMIT * 2,
) {
    const radians = (angle * Math.PI) / 180,
        c = Math.cos(radians),
        s = Math.sin(radians);
    const rotated = polygons.map((poly) =>
        poly.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c })),
    );
    const bounds = boundsOfPoints(rotated.flat());
    if ((bounds.maxY - bounds.minY) / spacing > LIMIT)
        throw new Error('Laser fill is too dense; increase line interval.');
    const result = [];
    const firstRow =
        scanOrigin === undefined
            ? 0
            : Math.max(
                  0,
                  Math.ceil(
                      (bounds.minY - scanOrigin - spacing / 2) / spacing - 1e-9,
                  ),
              );
    if (
        !Number.isSafeInteger(firstRow) ||
        bounds.minY + spacing === bounds.minY ||
        bounds.maxY + spacing === bounds.maxY
    )
        throw new Error('Laser fill coordinates exceed scan precision.');
    for (
        let y =
                scanOrigin === undefined
                    ? bounds.minY + spacing / 2
                    : scanOrigin + spacing / 2 + firstRow * spacing,
            row = firstRow;
        y < bounds.maxY;
        y += spacing, row++
    ) {
        const xs = [];
        for (const poly of rotated)
            for (let i = 0; i < poly.length - 1; i++) {
                const a = poly[i],
                    b = poly[i + 1];
                if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
                    xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
            }
        xs.sort((a, b) => a - b);
        const segments = [];
        for (let i = 0; i + 1 < xs.length; i += 2)
            if (xs[i + 1] - xs[i] > 1e-8) segments.push([xs[i], xs[i + 1]]);
        if (bidirectional && row % 2) {
            segments.reverse();
            for (const seg of segments) seg.reverse();
        }
        for (const seg of segments) {
            if ((result.length + 1) * 2 > pointBudget || result.length >= LIMIT)
                throw new Error(
                    'Laser fill is too dense; increase line interval.',
                );
            result.push(
                seg.map((x) => ({ x: x * c - y * s, y: x * s + y * c })),
            );
        }
    }
    return result;
}
function imagePaths(
    bitmap,
    config,
    o,
    onProgress = () => {},
    pointBudget = LIMIT * 2,
    rasterSink = null,
) {
    const b = bitmap.bounds,
        img = bitmap._imageData,
        step = config.laserSpot;
    if (
        !b ||
        !['minX', 'maxX', 'minY', 'maxY'].every((k) => Number.isFinite(b[k])) ||
        b.maxX <= b.minX ||
        b.maxY <= b.minY ||
        !img ||
        !Number.isInteger(img.width) ||
        !Number.isInteger(img.height) ||
        img.width < 1 ||
        img.height < 1 ||
        img.data.length !== img.width * img.height * 4
    )
        throw new Error('Invalid laser image or bounds.');
    if (
        o.passThrough &&
        Math.abs(o.scanAngle / 90 - Math.round(o.scanAngle / 90)) > 1e-9
    )
        throw new Error(
            'Pixel pass-through requires a scan angle in 90° steps. Rotate the image to change artwork orientation.',
        );
    const scanRadians = (o.scanAngle * Math.PI) / 180,
        sc = Math.cos(scanRadians),
        ss = Math.sin(scanRadians),
        cx = (b.minX + b.maxX) / 2,
        cy = (b.minY + b.maxY) / 2;
    const toScan = (x, y) => ({
        x: (x - cx) * sc + (y - cy) * ss,
        y: -(x - cx) * ss + (y - cy) * sc,
    });
    const crop = resolveImageCrop(
            o.imageCrop,
            img.width,
            img.height,
            o.passThrough,
        ),
        w = b.maxX - b.minX,
        h = b.maxY - b.minY;
    const corners = [
        [crop.left, crop.bottom],
        [crop.right, crop.bottom],
        [crop.right, crop.top],
        [crop.left, crop.top],
    ].map(([x, y]) => toScan(b.minX + x * w, b.minY + y * h));
    const masks = o.imageMask.map((poly) =>
        poly.map((p) => toScan(b.minX + p.x * w, b.minY + p.y * h)),
    );
    const sb = boundsOfPoints(corners);
    // Correct crop rounding on artwork-aligned grids; retain existing angled scan sampling.
    const tolerance = o.scanAngle === 0 ? 1e-9 : 0;
    const swapped = Math.abs(Math.round(o.scanAngle / 90)) % 2 === 1;
    const nativeCols = Math.round((crop.right - crop.left) * img.width),
        nativeRows = Math.round((crop.top - crop.bottom) * img.height);
    const cols = o.passThrough
            ? swapped
                ? nativeRows
                : nativeCols
            : Math.max(1, Math.ceil((sb.maxX - sb.minX) / step - tolerance)),
        rows = o.passThrough
            ? swapped
                ? nativeCols
                : nativeRows
            : Math.max(1, Math.ceil((sb.maxY - sb.minY) / step - tolerance)),
        dx = (sb.maxX - sb.minX) / cols,
        dy = (sb.maxY - sb.minY) / rows;
    if (
        !Number.isSafeInteger(cols) ||
        !Number.isSafeInteger(rows) ||
        cols * rows > LIMIT * 16
    )
        throw new Error(
            o.passThrough
                ? 'Image exceeds 16 million source pixels; resize the source image or disable pixel pass-through.'
                : 'Image exceeds 16 million laser samples; increase line interval.',
        );
    if (cols > LIMIT)
        throw new Error(
            o.passThrough
                ? 'Source image scan row is too wide; resize the source image or disable pixel pass-through.'
                : 'Image scan row is too wide; increase line interval or change scan angle.',
        );
    rasterSink?.start(cols, rows, sb.maxX - sb.minX, sb.maxY - sb.minY);
    const sourceLightness = o.passThrough
        ? null
        : createImageLightnessSampler(img, o);
    const matrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ];
    const kernels = {
        'floyd-steinberg': [
            [1, 0, 7 / 16],
            [-1, 1, 3 / 16],
            [0, 1, 5 / 16],
            [1, 1, 1 / 16],
        ],
        atkinson: [
            [1, 0, 1 / 8],
            [2, 0, 1 / 8],
            [-1, 1, 1 / 8],
            [0, 1, 1 / 8],
            [1, 1, 1 / 8],
            [0, 2, 1 / 8],
        ],
        stucki: [
            [1, 0, 8 / 42],
            [2, 0, 4 / 42],
            [-2, 1, 2 / 42],
            [-1, 1, 4 / 42],
            [0, 1, 8 / 42],
            [1, 1, 4 / 42],
            [2, 1, 2 / 42],
            [-2, 2, 1 / 42],
            [-1, 2, 2 / 42],
            [0, 2, 4 / 42],
            [1, 2, 2 / 42],
            [2, 2, 1 / 42],
        ],
        jarvis: [
            [1, 0, 7 / 48],
            [2, 0, 5 / 48],
            [-2, 1, 3 / 48],
            [-1, 1, 5 / 48],
            [0, 1, 7 / 48],
            [1, 1, 5 / 48],
            [2, 1, 3 / 48],
            [-2, 2, 1 / 48],
            [-1, 2, 3 / 48],
            [0, 2, 5 / 48],
            [1, 2, 3 / 48],
            [2, 2, 1 / 48],
        ],
    };
    const kernel = o.passThrough ? undefined : kernels[o.imageMode];
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const depth = Math.min(
        rows,
        1 + Math.max(0, ...(kernel ?? []).map(([, oy]) => oy)),
    );
    const buffers = Array.from({ length: depth }, () => ({
        row: -1,
        values: new Float64Array(cols),
        visible: new Uint8Array(cols),
        ranges: [],
    }));
    const halftone =
        !o.passThrough && o.imageMode === 'halftone'
            ? createHalftoneScreen(o.halftoneCellSize, o.halftoneAngle)
            : null;
    function loadRow(row) {
        const slot = buffers[row % depth];
        if (slot.row === row) return;
        slot.row = row;
        slot.values.fill(0);
        slot.visible.fill(0);
        const scanY = sb.minY + (row + 0.5) * dy,
            image = scanIntervals([corners], scanY);
        slot.ranges = masks.length
            ? intersectIntervals(image, scanIntervals(masks, scanY))
            : image;
        let rangeIndex = 0;
        for (let col = 0; col < cols; col++) {
            const sx = sb.minX + (col + 0.5) * dx;
            while (
                rangeIndex < slot.ranges.length &&
                sx > slot.ranges[rangeIndex][1] + 1e-9
            )
                rangeIndex++;
            if (
                rangeIndex === slot.ranges.length ||
                sx < slot.ranges[rangeIndex][0] - 1e-9
            )
                continue;
            const sampleX = cx + sx * sc - scanY * ss,
                sampleY = cy + sx * ss + scanY * sc;
            if (
                sampleX < b.minX - 1e-9 ||
                sampleX > b.maxX + 1e-9 ||
                sampleY < b.minY - 1e-9 ||
                sampleY > b.maxY + 1e-9
            )
                continue;
            const x = Math.min(
                    img.width - 1,
                    Math.max(
                        0,
                        Math.floor(
                            ((sampleX - b.minX) / (b.maxX - b.minX)) *
                                img.width,
                        ),
                    ),
                ),
                y = Math.min(
                    img.height - 1,
                    Math.max(
                        0,
                        Math.floor(
                            (1 - (sampleY - b.minY) / (b.maxY - b.minY)) *
                                img.height,
                        ),
                    ),
                );
            const i = (y * img.width + x) * 4,
                alpha = img.data[i + 3] / 255;
            if (o.passThrough) {
                slot.values[col] =
                    (1 - imageLightness(img, x, y, 0, 0)) * alpha;
                slot.visible[col] = alpha > 0 ? 1 : 0;
                continue;
            }
            let light = sourceLightness(x, y);
            light = clamp((light - 0.5) * o.contrast + 0.5 + o.brightness);
            let darkness = 1 - Math.pow(light, config.laserGamma);
            if (o.invert) darkness = 1 - darkness;
            if (o.shadeCount)
                darkness =
                    Math.round(clamp(darkness) * (o.shadeCount - 1)) /
                    (o.shadeCount - 1);
            slot.values[col] = halftone
                ? halftone(
                      clamp(darkness) * alpha,
                      sampleX - b.minX,
                      sampleY - b.minY,
                  )
                : clamp(darkness) * alpha;
            slot.visible[col] = alpha > 0 ? 1 : 0;
        }
    }
    const angle = ((bitmap.rotation ?? 0) * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
    const paths = [];
    let pointCount = 0;
    const reportEvery = Math.max(1, Math.ceil(rows / 80));
    for (let row = 0; row < rows; row++) {
        if (row % reportEvery === 0)
            onProgress(
                10 + Math.floor((70 * row) / rows),
                'Engraving image rows',
            );
        for (let ahead = row; ahead < Math.min(rows, row + depth); ahead++)
            loadRow(ahead);
        const current = buffers[row % depth];
        if (kernel)
            for (let col = 0; col < cols; col++) {
                const i = col;
                if (!current.visible[i]) continue;
                const old = current.values[i],
                    next = old >= o.threshold ? 1 : 0,
                    error = old - next;
                current.values[i] = next;
                for (const [ox, oy, weight] of kernel) {
                    const x = col + ox,
                        y = row + oy;
                    if (
                        x >= 0 &&
                        x < cols &&
                        y < rows &&
                        buffers[y % depth].visible[x]
                    )
                        buffers[y % depth].values[x] += error * weight;
                }
            }

        const valueAt = (col) => {
            let value = clamp(current.values[col]);
            if (
                !o.passThrough &&
                (o.imageMode === 'threshold' || o.imageMode === 'edge')
            )
                value = value >= o.threshold ? 1 : 0;
            if (!o.passThrough && o.imageMode === 'ordered')
                value = value > (matrix[row % 4][col % 4] + 0.5) / 16 ? 1 : 0;
            return current.visible[col] ? value : 0;
        };
        if (rasterSink) {
            rasterSink.row(row, cols, valueAt);
            continue;
        }
        const y = sb.minY + (row + 0.5) * dy;
        const cells = [];
        for (const [left, right] of current.ranges) {
            const first = Math.max(0, Math.floor((left - sb.minX) / dx)),
                last = Math.min(cols - 1, Math.floor((right - sb.minX) / dx));
            if (cells.length && left > cells[cells.length - 1].x1)
                cells.push({
                    x0: cells[cells.length - 1].x1,
                    x1: left,
                    power: 0,
                });
            for (let col = first; col <= last; col++) {
                const x0 = Math.max(left, sb.minX + col * dx),
                    x1 = Math.min(right, sb.minX + (col + 1) * dx);
                if (x1 <= x0 + 1e-9) continue;
                const value = valueAt(col);
                const power =
                    value === 0
                        ? 0
                        : Math.round(
                              config.laserSMin +
                                  value * (config.laserSMax - config.laserSMin),
                          );
                cells.push({ x0, x1, power });
            }
        }
        if (o.trimBlank) {
            while (cells.length && cells[cells.length - 1].power === 0)
                cells.pop();
            const first = cells.findIndex((cell) => cell.power > 0);
            if (first < 0) continue;
            cells.splice(0, first);
        }
        if (!cells.length) continue;
        const reverse = o.bidirectional && row % 2;
        if (reverse) cells.reverse();
        const start = reverse ? cells[0].x1 : cells[0].x0,
            direction = reverse ? -1 : 1;
        let points = [point(start, y, 0)];
        if (config.laserOverscan)
            points.unshift(
                point(start - direction * config.laserOverscan, y, 0),
            );
        for (const cell of cells) {
            const next = point(reverse ? cell.x0 : cell.x1, y, cell.power);
            if (
                points.length > 1 &&
                points[points.length - 1].power === cell.power
            )
                points[points.length - 1] = next;
            else {
                if ((pointCount + points.length + 1) * o.passes > pointBudget)
                    throw new Error(
                        'Laser job is too large; reduce passes or increase interval.',
                    );
                points.push(next);
            }
        }
        if (config.laserOverscan)
            points.push(
                point(
                    points[points.length - 1].x +
                        direction * config.laserOverscan,
                    y,
                    0,
                ),
            );
        points = correctLaserDots(
            points,
            o.dotWidthCorrection,
            Math.floor(pointBudget / o.passes) - pointCount,
        );
        pointCount += points.length;
        if (pointCount * o.passes > pointBudget)
            throw new Error(
                'Laser job is too large; reduce passes or increase interval.',
            );
        for (const p of points) {
            const x = cx + p.x * sc - p.y * ss,
                y = cy + p.x * ss + p.y * sc;
            p.x = cx + (x - cx) * c - (y - cy) * s;
            p.y = cy + (x - cx) * s + (y - cy) * c;
        }
        paths.push(o.passThrough ? { points, laserInterval: dy } : { points });
    }
    return paths;
}
/** @returns {{[key:string]:any, label:string, previewContours:Array<Array<{x:number,y:number}> & {_intensity?:number,_laserPower?:number,_laserVariablePower?:boolean}>, laserPaths:Array<{points:Array<{x:number,y:number,power:number}>,feed?:number,laserPassStart?:number,laserInterval?:number,laserLeadInside?:boolean}>, laserOptions:ReturnType<typeof laserOptions>}} */
export function createLaserToolpath(loops, config, options = {}) {
    const o = laserOptions({
        ...config.laserOptions,
        ...(config.laserManualTabs?.length &&
        config.laserOptions?.bridgeMode === undefined
            ? { bridges: true, bridgeMode: 'manual' }
            : {}),
    });
    if (config.operation === 'laser-raster' && o.passThrough) {
        const bitmap = options.sourceEntities?.find(
            (e) => e.type === 'BITMAP' && e._imageData,
        );
        if (!bitmap) throw new Error('Laser Raster needs a bitmap.');
        config = {
            ...config,
            laserSpot: Math.min(
                (bitmap.bounds?.maxX - bitmap.bounds?.minX) /
                    bitmap._imageData.width,
                (bitmap.bounds?.maxY - bitmap.bounds?.minY) /
                    bitmap._imageData.height,
            ),
        };
    }
    for (const key of ['laserFeed', 'laserSpot', 'laserGamma'])
        if (!Number.isFinite(config[key]) || config[key] <= 0)
            throw new Error(`Invalid ${key}.`);
    for (const key of ['laserPower', 'laserSMin', 'laserSMax'])
        if (
            !Number.isFinite(config[key]) ||
            config[key] < 0 ||
            config[key] > 1000
        )
            throw new Error('Laser power must be between 0 and 1000.');
    if (config.laserSMin > config.laserSMax)
        throw new Error('Laser minimum power cannot exceed maximum power.');
    if (!Number.isFinite(config.laserOverscan) || config.laserOverscan < 0)
        throw new Error('Invalid laser overscan.');
    const pointBudget = options._pointBudget ?? LIMIT * 2;
    if (
        !Number.isInteger(pointBudget) ||
        pointBudget < 0 ||
        pointBudget > LIMIT * 2
    )
        throw new Error(
            'Laser job is too large; reduce passes or increase interval.',
        );
    if (
        o.angleIncrement % 360 !== 0 &&
        o.passes > 1 &&
        (config.operation === 'laser-raster' ||
            (config.operation === 'laser-fill' && o.fillMode === 'hatch'))
    ) {
        const paths = [],
            preview = [];
        const cache = new Map();
        let base,
            count = 0;
        for (let pass = 0; pass < o.passes; pass++) {
            const angleKey =
                config.operation === 'laser-raster' ? 'scanAngle' : 'fillAngle';
            const angle =
                (((o[angleKey] + pass * o.angleIncrement) % 360) + 360) % 360;
            let planned = cache.get(angle);
            if (!planned) {
                planned = createLaserToolpath(
                    loops,
                    {
                        ...config,
                        laserOptions: {
                            ...o,
                            passes: 1,
                            angleIncrement: 0,
                            [angleKey]: angle,
                        },
                    },
                    {
                        ...options,
                        _pointBudget: pointBudget - count,
                        onProgress: (percent, label) =>
                            options.onProgress?.(
                                Math.floor((pass * 100 + percent) / o.passes),
                                `Pass ${pass + 1}/${o.passes}: ${label}`,
                            ),
                    },
                );
                cache.set(angle, planned);
            }
            base ??= planned;
            count += planned.laserPaths.reduce(
                (n, path) => n + path.points.length,
                0,
            );
            if (count > pointBudget)
                throw new Error(
                    'Laser job is too large; reduce passes or increase interval.',
                );
            paths.push(
                ...planned.laserPaths.map((path, i) =>
                    i ? path : { ...path, laserPassStart: pass + 1 },
                ),
            );
            preview.push(...planned.previewContours);
            options.onProgress?.(
                Math.floor(((pass + 1) * 100) / o.passes),
                `Pass ${pass + 1}/${o.passes} ready`,
            );
        }
        // All passes are baked in order; one emission prevents older readers repeating them.
        return {
            ...base,
            id: options.id || base.id,
            laserOptions: { ...o, passes: 1 },
            laserPassCount: o.passes,
            laserPaths: paths,
            previewContours: preview,
            cardMeta: `${base.operationLabel} · ${o.passes} passes · ${config.laserFeed} mm/min`,
        };
    }
    let paths = [];
    if (config.operation === 'laser-raster') {
        if (
            !o.passThrough &&
            o.imageMode === 'halftone' &&
            o.halftoneCellSize < 2 * config.laserSpot
        )
            throw new Error(
                'Halftone dot spacing must be at least twice the line interval; increase DPI or dot spacing.',
            );
        if (
            o.dotWidthCorrection > 0 &&
            o.dotWidthCorrection >= config.laserSpot
        )
            throw new Error(
                'Dot-width correction must be smaller than the line interval.',
            );
        const bitmap = options.sourceEntities?.find(
            (e) => e.type === 'BITMAP' && e._imageData,
        );
        if (!bitmap) throw new Error('Laser Raster needs a bitmap.');
        paths = imagePaths(bitmap, config, o, options.onProgress, pointBudget);
    } else {
        const polygons = loops
            .map((l) => l.points)
            .filter((p) => p?.length >= 2);
        if (
            polygons.some((p) =>
                p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y)),
            )
        )
            throw new Error('Invalid laser geometry.');
        if (!polygons.length) throw new Error('No laser paths selected.');
        if (config.operation === 'laser-fill' || o.kerf !== 0) {
            if (polygons.some((p) => !closed(p)))
                throw new Error(
                    'Fill and kerf compensation require closed shapes.',
                );
            const grouped =
                config.operation === 'laser-fill' && o.fillSequence === 'groups'
                    ? compositePocketGeometry(loops, 1e-8)
                    : null;
            let composite =
                grouped?.paths ?? compositePocketSeedPaths(loops, 1e-8);
            if (o.kerf !== 0)
                composite = offsetCompositePolygons(
                    composite,
                    o.kerf / 2,
                    1e-8,
                );
            if (config.operation === 'laser-fill') {
                const groups = grouped
                    ? artworkFillGroups(composite, grouped.records)
                    : o.fillSequence === 'individual'
                      ? groupCompositePolygons(composite)
                      : [composite];
                const angles = o.crosshatch
                    ? [o.fillAngle, o.fillAngle + 90]
                    : [o.fillAngle];
                const origins = angles.map((angle) => {
                    if (o.fillSequence === 'all') return undefined;
                    const radians = (angle * Math.PI) / 180;
                    return composite.reduce(
                        (minimum, poly) =>
                            poly.reduce(
                                (low, p) =>
                                    Math.min(
                                        low,
                                        -p.x * Math.sin(radians) +
                                            p.y * Math.cos(radians),
                                    ),
                                minimum,
                            ),
                        Infinity,
                    );
                });
                let pointCount = 0,
                    count = 0;
                const add = (points) => {
                    pointCount += points.length;
                    if (pointCount * o.passes > pointBudget)
                        throw new Error(
                            'Laser fill is too dense; increase line interval or reduce passes.',
                        );
                    paths.push({ points });
                };
                for (const group of groups) {
                    if (o.fillMode === 'offset') {
                        let level = offsetCompositePolygons(
                            group,
                            -config.laserSpot / 2,
                            1e-8,
                        );
                        while (level.length) {
                            for (const points of level) add(points);
                            if (++count > 10000 || paths.length > LIMIT)
                                throw new Error('Offset fill is too dense.');
                            level = offsetCompositePolygons(
                                level,
                                -config.laserSpot,
                                1e-8,
                            );
                        }
                    } else
                        for (let i = 0; i < angles.length; i++)
                            for (const points of hatchPaths(
                                group,
                                config.laserSpot,
                                angles[i],
                                o.bidirectional,
                                origins[i],
                                Math.floor(pointBudget / o.passes) - pointCount,
                            ))
                                add(points);
                }
            } else paths = composite.map((points) => ({ points }));
        } else
            paths = polygons.map((points) => ({
                points: points.map((p) => ({ ...p })),
            }));
        if (config.operation === 'laser-cut')
            paths = orderLaserCuts(
                paths,
                { ...o, bridges: o.bridges && o.bridgeMode === 'automatic' },
                Math.floor(pointBudget / o.passes),
                Array.isArray(config.laserManualTabs) &&
                    config.laserManualTabs.some((tab) => !tab?.anchor),
            );
        if (
            config.operation === 'laser-cut' &&
            o.bridges &&
            o.bridgeMode === 'manual' &&
            config.laserManualTabs !== undefined
        ) {
            config = {
                ...config,
                laserManualTabs: resolveManualLaserTabs(
                    paths,
                    config.laserManualTabs,
                ),
            };
            paths = manualLaserBridges(
                paths,
                config.laserManualTabs,
                o.bridgeWidth,
                Math.floor(pointBudget / o.passes),
                o.bridgePower,
            );
        }
        paths = paths.map((path) => ({
            ...path,
            points: path.points.map((p) =>
                point(
                    p.x,
                    p.y,
                    config.operation === 'laser-cut' &&
                        (o.bridges || o.perforation) &&
                        p.power !== undefined
                        ? Math.max(0, Math.min(1, p.power)) * config.laserPower
                        : config.laserPower,
                ),
            ),
        }));
    }
    if (
        config.operation === 'laser-cut' &&
        o.removeSharedCuts &&
        config.laserPower > 0
    )
        paths = removeSharedLaserCuts(
            paths,
            Math.floor(pointBudget / o.passes),
        );
    const aligned = scanAlignmentApplies(config.operation, o);
    const alignedFill = config.operation === 'laser-fill' && aligned;
    const overscannedFill =
        config.operation === 'laser-fill' &&
        o.fillMode === 'hatch' &&
        o.hatchOverscan &&
        config.laserOverscan > 0;
    if (alignedFill && !overscannedFill)
        throw new Error('Enable positive hatch overscan for scan alignment.');
    if (overscannedFill) {
        if (o.fillSequence === 'all' && !config.laserRotary)
            paths = joinHatchRuns(paths, config.laserOverscan);
        if (
            paths.reduce((n, p) => n + p.points.length + 2, 0) * o.passes >
            pointBudget
        )
            throw new Error(
                'Laser job is too large; reduce passes or increase interval.',
            );
        paths = overscanFillPaths(paths, config.laserOverscan);
    }
    if (aligned) alignScanPaths(paths, o.scanAlignment, config.laserFeed);
    if (!paths.length && config.operation !== 'laser-raster')
        throw new Error('No laser paths remain; reduce kerf or line interval.');
    if (paths.reduce((n, p) => n + p.points.length, 0) * o.passes > pointBudget)
        throw new Error(
            'Laser job is too large; reduce passes or increase interval.',
        );
    /** @type {Array<Array<{x:number,y:number}> & {_intensity?:number,_laserPower?:number,_laserVariablePower?:boolean}>} */
    const previewContours = [];
    for (const path of paths) {
        if (
            config.operation !== 'laser-raster' &&
            !overscannedFill &&
            !(
                config.operation === 'laser-cut' &&
                (o.bridges || o.perforation || o.removeSharedCuts)
            )
        ) {
            const points = path.points.map(({ x, y }) => ({ x, y }));
            points._intensity = config.laserPower / 1000;
            points._laserPower = config.laserPower / 1000;
            previewContours.push(points);
        } else
            previewContours.push(
                Object.assign([...path.points], {
                    _laserVariablePower: true,
                    ...(path.laserInterval
                        ? { _laserInterval: path.laserInterval }
                        : {}),
                }),
            );
    }
    if (
        config.operation === 'laser-cut' &&
        (o.leadInLength || o.leadOutLength)
    ) {
        const add = (a, b) => {
            const points = [a, b];
            points._laserPower = config.laserPower / 1000;
            previewContours.push(points);
        };
        for (const path of paths) {
            const leads = laserLeadEndpoints(path, o, config.laserPower);
            if (leads.entry) add(leads.entry, path.points[0]);
            if (leads.exit) add(path.points.at(-1), leads.exit);
            const tail = laserOvercutPoints(path.points, o.overcut);
            if (tail) {
                const final = laserLeadEndpoints(
                    path,
                    o,
                    config.laserPower,
                    tail,
                );
                if (final.exit) add(tail.at(-1), final.exit);
            }
        }
    }
    const operationLabel = {
        'laser-cut': 'Laser Cut',
        'laser-fill': 'Laser Fill',
        'laser-raster': 'Laser Raster',
    }[config.operation];
    return {
        ...config,
        id: options.id || crypto.randomUUID(),
        operationLabel,
        emission: 'laser-cut',
        label:
            options.label ||
            `${operationLabel} (${loops.length} shape${loops.length === 1 ? '' : 's'})`,
        cardMeta: `${operationLabel} · ${o.passes} pass${o.passes === 1 ? '' : 'es'} · ${config.laserFeed} mm/min`,
        laserOptions: o,
        laserPaths: paths,
        previewContours,
        passDepths: [0],
        tabs: [],
        tabHeight: 0,
    };
}

/** Artwork-local processed pixels, independent of machine power, travel and passes.
 * @param {any} bitmap
 * @param {number} interval
 * @param {number} gamma
 * @param {object} [input]
 * @param {(percent: number, label: string) => void} [onProgress]
 */
export function processLaserImage(
    bitmap,
    interval,
    gamma,
    input = {},
    onProgress = () => {},
) {
    if (
        !Number.isFinite(interval) ||
        interval <= 0 ||
        !Number.isFinite(gamma) ||
        gamma <= 0
    )
        throw new Error('Invalid image resolution or gamma.');
    const o = laserOptions({
        ...input,
        scanAngle: 0,
        passes: 1,
        dotWidthCorrection: 0,
    });
    if (
        !o.passThrough &&
        o.imageMode === 'halftone' &&
        o.halftoneCellSize < 2 * interval
    )
        throw new Error(
            'Halftone dot spacing must be at least twice the line interval.',
        );
    /** @type {{width:number,height:number,widthMm:number,heightMm:number,data:Uint8ClampedArray} | undefined} */
    let result;
    imagePaths(
        bitmap,
        { laserSpot: interval, laserGamma: gamma },
        o,
        onProgress,
        LIMIT * 2,
        {
            start(width, height, widthMm, heightMm) {
                result = {
                    width,
                    height,
                    widthMm,
                    heightMm,
                    data: new Uint8ClampedArray(width * height * 4),
                };
                result.data.fill(255);
            },
            row(row, cols, valueAt) {
                for (let col = 0; col < cols; col++) {
                    const i = ((result.height - 1 - row) * cols + col) * 4;
                    const gray = 255 - Math.round(valueAt(col) * 255);
                    result.data[i] =
                        result.data[i + 1] =
                        result.data[i + 2] =
                            gray;
                }
            },
        },
    );
    if (!result) throw new Error('Image processing produced no pixels.');
    return result;
}
