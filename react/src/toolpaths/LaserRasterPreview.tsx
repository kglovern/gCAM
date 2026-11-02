import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { FULL_IMAGE } from '../cam/raster-region.js';
import { strokePoweredPath } from '../canvas/poweredPath';
import type { LaserOptions } from './toolpathRequest';

type Contour = { x: number; y: number }[] & {
    _laserInterval?: number;
    _laserPower?: number;
    _laserVariablePower?: boolean;
};
/** Use the worker's powered segments so processing and preview agree. */
export function LaserRasterPreview({
    contours,
    frame,
    interval,
    maxPower,
    sourceImage,
    crop = FULL_IMAGE,
    onCrop,
    caption = 'Processed image · relative to selected maximum power',
}: {
    contours: Contour[];
    frame: { x: number; y: number }[];
    interval: number;
    maxPower: number;
    sourceImage?: HTMLImageElement;
    crop?: NonNullable<LaserOptions['imageCrop']>;
    onCrop?: (crop: NonNullable<LaserOptions['imageCrop']>) => void;
    caption?: string;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const [cropping, setCropping] = useState(false);
    const [dragCrop, setDragCrop] = useState<typeof crop | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const view = useRef({ scale: 1, ox: 0, oy: 0, minX: 0, minY: 0 });
    const imagePoint = (event: PointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget,
            rect = canvas.getBoundingClientRect(),
            v = view.current;
        if (frame.length < 4) return null;
        const world = {
            x: ((event.clientX - rect.left) * canvas.width) / rect.width,
            y: ((event.clientY - rect.top) * canvas.height) / rect.height,
        };
        world.x = (world.x - v.ox) / v.scale + v.minX;
        world.y = (canvas.height - v.oy - world.y) / v.scale + v.minY;
        const a = frame[0],
            u = { x: frame[1].x - a.x, y: frame[1].y - a.y },
            w = { x: frame[3].x - a.x, y: frame[3].y - a.y },
            det = u.x * w.y - u.y * w.x;
        if (Math.abs(det) < 1e-12) return null;
        const dx = world.x - a.x,
            dy = world.y - a.y,
            clamp = (n: number) => Math.max(0, Math.min(1, n));
        return {
            x: clamp((dx * w.y - dy * w.x) / det),
            y: clamp((u.x * dy - u.y * dx) / det),
        };
    };
    const cropTo = (end: { x: number; y: number }) =>
        start.current
            ? {
                  left: Math.min(start.current.x, end.x),
                  bottom: Math.min(start.current.y, end.y),
                  right: Math.max(start.current.x, end.x),
                  top: Math.max(start.current.y, end.y),
              }
            : null;
    useEffect(() => {
        const canvas = ref.current,
            ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of frame) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        if (!Number.isFinite(minX)) return;
        const scale = Math.min(
            (canvas.width - 12) / Math.max(interval, maxX - minX),
            (canvas.height - 12) / Math.max(interval, maxY - minY),
        );
        const ox = (canvas.width - (maxX - minX) * scale) / 2,
            oy = (canvas.height - (maxY - minY) * scale) / 2;
        view.current = { scale, ox, oy, minX, minY };
        if (cropping && sourceImage && frame.length >= 4) {
            ctx.save();
            ctx.transform(
                (frame[2].x - frame[3].x) * scale,
                -(frame[2].y - frame[3].y) * scale,
                (frame[0].x - frame[3].x) * scale,
                -(frame[0].y - frame[3].y) * scale,
                ox + (frame[3].x - minX) * scale,
                canvas.height - oy - (frame[3].y - minY) * scale,
            );
            ctx.drawImage(sourceImage, 0, 0, 1, 1);
            ctx.restore();
        }
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(0.25, interval * scale);
        ctx.lineCap = 'butt';
        for (const line of cropping ? [] : contours) {
            ctx.lineWidth = Math.max(
                0.25,
                (line._laserInterval ?? interval) * scale,
            );
            if (line._laserVariablePower) {
                strokePoweredPath(
                    ctx,
                    line,
                    (x, y) => ({
                        x: ox + (x - minX) * scale,
                        y: canvas.height - oy - (y - minY) * scale,
                    }),
                    maxPower,
                );
                continue;
            }
            ctx.globalAlpha = Math.min(
                1,
                (line._laserPower ?? 0) / Math.max(0.001, maxPower / 1000),
            );
            ctx.beginPath();
            line.forEach((p, i) => {
                const x = ox + (p.x - minX) * scale,
                    y = canvas.height - oy - (p.y - minY) * scale;
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            });
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (cropping && frame.length >= 4) {
            const region = dragCrop ?? crop;
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            [
                [region.left, region.bottom],
                [region.right, region.bottom],
                [region.right, region.top],
                [region.left, region.top],
                [region.left, region.bottom],
            ].forEach(([u, v], i) => {
                const x =
                        frame[0].x +
                        u * (frame[1].x - frame[0].x) +
                        v * (frame[3].x - frame[0].x),
                    y =
                        frame[0].y +
                        u * (frame[1].y - frame[0].y) +
                        v * (frame[3].y - frame[0].y);
                const px = ox + (x - minX) * scale,
                    py = canvas.height - oy - (y - minY) * scale;
                if (i) ctx.lineTo(px, py);
                else ctx.moveTo(px, py);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }, [
        contours,
        frame,
        interval,
        maxPower,
        cropping,
        sourceImage,
        crop,
        dragCrop,
    ]);
    return (
        <figure className="rounded border border-slate-300 p-2 dark:border-robin-900">
            <canvas
                ref={ref}
                width={560}
                height={280}
                role="img"
                aria-label="Processed laser image preview"
                className={`w-full rounded bg-white ${cropping ? 'cursor-crosshair touch-none' : ''}`}
                onPointerDown={(event) => {
                    if (!cropping) return;
                    start.current = imagePoint(event);
                    if (start.current) {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDragCrop(cropTo(start.current));
                    }
                }}
                onPointerMove={(event) => {
                    if (!start.current) return;
                    const end = imagePoint(event);
                    if (end) setDragCrop(cropTo(end));
                }}
                onPointerUp={(event) => {
                    const end = imagePoint(event),
                        next = end && cropTo(end);
                    if (
                        next &&
                        next.right - next.left > 1e-5 &&
                        next.top - next.bottom > 1e-5
                    )
                        onCrop?.(next);
                    start.current = null;
                    setDragCrop(null);
                }}
                onPointerCancel={() => {
                    start.current = null;
                    setDragCrop(null);
                }}
            />
            <figcaption className="mt-1 text-[10px] text-slate-500">
                {cropping
                    ? 'Drag a crop rectangle; numeric controls are also available.'
                    : caption}
            </figcaption>
            {onCrop && sourceImage && (
                <button
                    type="button"
                    className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-robin-900"
                    aria-pressed={cropping}
                    onClick={() => {
                        start.current = null;
                        setDragCrop(null);
                        setCropping((value) => !value);
                    }}
                >
                    {cropping ? 'Done cropping' : 'Crop on preview'}
                </button>
            )}
        </figure>
    );
}
