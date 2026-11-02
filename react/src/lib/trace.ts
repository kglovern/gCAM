/**
 * Purpose: Implementation module for trace in the lib domain.
 */
import {
    getPaths,
    traceCanvas,
    traceImage,
} from '../engine/potrace-js/index.js';
import { closePoints } from '../geometry/primitives.js';

export interface PixelPoint {
    x: number;
    y: number;
}

/** Cubic bezier flattening for traced CURVE segments. */
export function flattenTracedPaths(
    paths: { type: string; [key: string]: number | string }[][],
    steps = 16,
): PixelPoint[][] {
    const loops: PixelPoint[][] = [];
    for (const segs of paths) {
        const pts: PixelPoint[] = [];
        let cursor: PixelPoint | null = null;
        for (const seg of segs) {
            if (seg.type === 'POINT') {
                cursor = { x: Number(seg.x), y: Number(seg.y) };
                pts.push(cursor);
            } else {
                const x1 = Number(seg.x1);
                const y1 = Number(seg.y1);
                const x2 = Number(seg.x2);
                const y2 = Number(seg.y2);
                const x = Number(seg.x);
                const y = Number(seg.y);
                const p0 = cursor ?? { x, y };
                for (let i = 1; i <= steps; i += 1) {
                    const t = i / steps;
                    const mt = 1 - t;
                    pts.push({
                        x:
                            mt * mt * mt * p0.x +
                            3 * mt * mt * t * x1 +
                            3 * mt * t * t * x2 +
                            t * t * t * x,
                        y:
                            mt * mt * mt * p0.y +
                            3 * mt * mt * t * y1 +
                            3 * mt * t * t * y2 +
                            t * t * t * y,
                    });
                }
                cursor = { x, y };
            }
        }
        if (pts.length >= 3) loops.push(closePoints(pts));
    }
    return loops;
}

export interface PlacedTrace {
    points: { x: number; y: number }[];
}

export interface PreprocessOptions {
    /** -100..100, 0 = unchanged */
    brightness: number;
    /** -100..100, 0 = unchanged */
    contrast: number;
    /** 0..255 binarization cutoff, null = no threshold */
    threshold: number | null;
    invert: boolean;
    traceTransparency?: boolean;
    cutoff?: number;
}

/** In-place brightness/contrast/grayscale/threshold/invert scan. */
export function preprocessImageData(
    image: { width: number; height: number; data: Uint8ClampedArray },
    opts: PreprocessOptions,
): void {
    const { data } = image;
    const brightness = ((opts.brightness || 0) / 100) * 255;
    const contrast = (opts.contrast || 0) / 100;
    const factor =
        (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        let lum = opts.traceTransparency
            ? 255 - data[i + 3]
            : (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) *
                  alpha +
              255 * (1 - alpha);
        lum = factor * (lum - 128) + 128 + brightness;
        if (opts.threshold != null) {
            lum = lum >= opts.threshold || lum < (opts.cutoff ?? 0) ? 255 : 0;
        }
        if (opts.invert) lum = 255 - lum;
        const v =
            !opts.traceTransparency && alpha === 0
                ? 255
                : Math.max(0, Math.min(255, Math.round(lum)));
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
    }
}

function placePixelLoops(
    pixelLoops: PixelPoint[][],
    pixelW: number,
    pixelH: number,
    originX: number,
    originY: number,
    widthMm: number,
    heightMm: number,
): PlacedTrace[] {
    const pw = Math.max(1, pixelW);
    const ph = Math.max(1, pixelH);
    const sx = widthMm / pw;
    const sy = heightMm / ph;
    return pixelLoops.map((loop) => ({
        points: loop.map((p) => ({
            x: originX + p.x * sx,
            y: originY + heightMm - p.y * sy,
        })),
    }));
}

/**
 * Trace a loaded image into world-mm loops fitted onto the bitmap's
 * placement (pixels scale to the placed size, Y flipped to world up).
 */
export async function traceBitmapImage(
    img: HTMLImageElement,
    originX: number,
    originY: number,
    widthMm: number,
    heightMm: number,
    turdsize = 2,
): Promise<PlacedTrace[]> {
    const pathList = traceImage(img, { turdsize });
    const pixelLoops = flattenTracedPaths(getPaths(pathList));
    return placePixelLoops(
        pixelLoops,
        img.naturalWidth,
        img.naturalHeight,
        originX,
        originY,
        widthMm,
        heightMm,
    );
}

/** Trace an already-preprocessed canvas (trace workbench preview). */
export async function traceProcessedCanvas(
    canvas: HTMLCanvasElement,
    pixelW: number,
    pixelH: number,
    originX: number,
    originY: number,
    widthMm: number,
    heightMm: number,
    turdsize = 2,
): Promise<PlacedTrace[]> {
    const pathList = traceCanvas(canvas, { turdsize });
    const pixelLoops = flattenTracedPaths(getPaths(pathList));
    return placePixelLoops(
        pixelLoops,
        pixelW,
        pixelH,
        originX,
        originY,
        widthMm,
        heightMm,
    );
}
