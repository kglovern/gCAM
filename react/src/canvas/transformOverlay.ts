/**
 * Purpose: Implementation module for transformOverlay in the react domain.
 */
import { strokePoints } from './primitives';
import type { SelectionFrame } from './selectionGeometry';

type Point = { x: number; y: number };

/** Paint the selection frame, handles, and live transform geometry. */
export function paintTransformOverlay(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => Point,
    frame: SelectionFrame,
    mode: 'move' | 'scale' | 'rotate' | 'transform',
    preview: Point[][] | null,
): void {
    const nw = toScreen(frame.minX, frame.maxY);
    const ne = toScreen(frame.maxX, frame.maxY);
    const se = toScreen(frame.maxX, frame.minY);
    const sw = toScreen(frame.minX, frame.minY);
    const center = toScreen(
        (frame.minX + frame.maxX) / 2,
        (frame.minY + frame.maxY) / 2,
    );
    ctx.save();
    if (preview) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        for (const points of preview) strokePoints(ctx, points, toScreen);
    }
    if (preview) ctx.globalAlpha = 0.25;
    ctx.strokeStyle = preview ? '#94a3b8' : '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (mode === 'scale' || mode === 'transform')
        paintScaleHandles(ctx, [nw, ne, se, sw]);
    if (mode === 'rotate' || mode === 'transform')
        paintRotateHandles(ctx, [nw, ne, se, sw], center);
    ctx.restore();
}

function paintScaleHandles(
    ctx: CanvasRenderingContext2D,
    corners: Point[],
): void {
    for (const corner of corners) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(corner.x - 5, corner.y - 5, 10, 10);
        ctx.fill();
        ctx.stroke();
    }
}

function paintRotateHandles(
    ctx: CanvasRenderingContext2D,
    corners: Point[],
    center: Point,
): void {
    for (const corner of corners) {
        const dx = corner.x - center.x;
        const dy = corner.y - center.y;
        const length = Math.hypot(dx, dy) || 1;
        const handle = {
            x: corner.x + (dx / length) * 18,
            y: corner.y + (dy / length) * 18,
        };
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(corner.x, corner.y);
        ctx.lineTo(handle.x, handle.y);
        ctx.stroke();
        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}
