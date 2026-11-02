import { traceCenterlines } from './centerline';
import { Bitmap, traceBitmap, getPaths } from '../engine/potrace-js/index.js';
import { flattenBezier } from '../geometry/curveFlattening.js';
import {
    preprocessImageData,
    type PreprocessOptions,
    type PlacedTrace,
} from './trace';

export interface TracePixelsRequest {
    image: { width: number; height: number; data: Uint8ClampedArray };
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
    };
    options: PreprocessOptions & {
        turdsize: number;
        traceMode?: 'outline' | 'centerline';
        smoothness?: number;
        optimize?: number;
    };
}
const POINT_LIMIT = 1000000;
export function tracePixels({
    image,
    placement: p,
    options: o,
}: TracePixelsRequest): PlacedTrace[] {
    if (
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width * image.height > 16777216 ||
        !(image.data instanceof Uint8ClampedArray) ||
        image.data.length !== image.width * image.height * 4
    )
        throw new Error(
            'Trace image exceeds 16 million pixels or has invalid pixel data.',
        );
    if (
        ![p.x, p.y, p.width, p.height, p.rotation ?? 0].every(
            Number.isFinite,
        ) ||
        p.width <= 0 ||
        p.height <= 0 ||
        Math.max(Math.abs(p.x), Math.abs(p.y), p.width, p.height) > 1000000
    )
        throw new Error('Invalid bitmap trace placement.');
    if (
        !Number.isFinite(o.brightness) ||
        Math.abs(o.brightness) > 100 ||
        !Number.isFinite(o.contrast) ||
        Math.abs(o.contrast) > 100 ||
        !Number.isFinite(o.threshold) ||
        Number(o.threshold) < 0 ||
        Number(o.threshold) > 255 ||
        !Number.isFinite(o.cutoff ?? 0) ||
        (o.cutoff ?? 0) < 0 ||
        (o.cutoff ?? 0) > Number(o.threshold) ||
        typeof o.invert !== 'boolean' ||
        (o.traceTransparency !== undefined &&
            typeof o.traceTransparency !== 'boolean') ||
        !Number.isInteger(o.turdsize) ||
        o.turdsize < 0 ||
        o.turdsize > 10000 ||
        !['outline', 'centerline'].includes(o.traceMode ?? 'outline') ||
        !Number.isFinite(o.smoothness ?? 1) ||
        (o.smoothness ?? 1) < 0 ||
        (o.smoothness ?? 1) > 1.33 ||
        !Number.isFinite(o.optimize ?? 0.2) ||
        (o.optimize ?? 0.2) < 0 ||
        (o.optimize ?? 0.2) > 1
    )
        throw new Error('Invalid bitmap trace settings.');
    preprocessImageData(image, o);
    const angle = ((p.rotation ?? 0) * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
    const world = (x: number, y: number) => {
        const dx = (x / image.width - 0.5) * p.width,
            dy = (0.5 - y / image.height) * p.height;
        return {
            x: p.x + p.width / 2 + dx * cos - dy * sin,
            y: p.y + p.height / 2 + dx * sin + dy * cos,
        };
    };
    if (o.traceMode === 'centerline')
        return traceCenterlines(image, o.turdsize).map((points) => ({
            points: points.map((point) => {
                const placed = world(point.x, point.y);
                if (
                    ![placed.x, placed.y].every(Number.isFinite) ||
                    Math.max(Math.abs(placed.x), Math.abs(placed.y)) > 1000000
                )
                    throw new Error(
                        'Trace coordinates exceed supported bounds.',
                    );
                return placed;
            }),
        }));
    const bitmap = new Bitmap(image.width, image.height);
    for (let i = 0; i < bitmap.size; i++)
        bitmap.data[i] = image.data[i * 4] < 128 ? 1 : 0;
    const paths = getPaths(
        traceBitmap(bitmap, {
            turdsize: o.turdsize,
            alphamax: o.smoothness ?? 1,
            optcurve: (o.optimize ?? 0.2) > 0,
            opttolerance: o.optimize ?? 0.2,
        }),
    );
    let remaining = POINT_LIMIT;
    const result: PlacedTrace[] = [];
    for (const segments of paths) {
        const points: { x: number; y: number }[] = [];
        const append = (point: { x: number; y: number }) => {
            if (--remaining < 0)
                throw new Error(
                    'Trace exceeds one million points; reduce resolution or increase speckle filtering.',
                );
            if (
                ![point.x, point.y].every(Number.isFinite) ||
                Math.max(Math.abs(point.x), Math.abs(point.y)) > 1000000
            )
                throw new Error('Trace coordinates exceed supported bounds.');
            points.push(point);
        };
        for (const segment of segments) {
            const end = world(Number(segment.x), Number(segment.y));
            if (segment.type === 'POINT') append(end);
            else if (segment.type === 'CURVE' && 'x1' in segment) {
                if (!points.length || remaining < 2)
                    throw new Error('Invalid or oversized traced curve.');
                const curve = flattenBezier(
                    [
                        points[points.length - 1],
                        world(Number(segment.x1), Number(segment.y1)),
                        world(Number(segment.x2), Number(segment.y2)),
                        end,
                    ],
                    0.05,
                    Math.min(remaining + 1, POINT_LIMIT),
                );
                for (const point of curve.slice(1)) append(point);
            } else throw new Error('Invalid traced segment.');
        }
        if (points.length >= 3) {
            const a = points[0],
                b = points[points.length - 1];
            if (a.x !== b.x || a.y !== b.y) append({ ...a });
            result.push({ points });
        }
    }
    return result;
}
