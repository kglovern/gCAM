/**
 * Purpose: Implementation module for trim in the canvas domain.
 */
import { findTrimTarget } from '../../lib/trim';
import { worldAtEvent } from './helpers';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

export function handleTrimDown(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (deps.activeTool !== 'trim' || event.button !== 0 || !event.ctrlKey)
        return false;
    const canvas = deps.canvasRef.current;
    if (!canvas) return false;
    deps.trimBrushRef.current = {
        points: [worldAtEvent(event, canvas, deps.cameraRef.current)],
    };
    event.preventDefault();
    deps.forceTick();
    return true;
}

export function handleTrimMove(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const brush = deps.trimBrushRef.current;
    if (!brush) return false;
    const canvas = deps.canvasRef.current;
    if (canvas) {
        const point = worldAtEvent(event, canvas, deps.cameraRef.current);
        const last = brush.points[brush.points.length - 1];
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1) {
            brush.points.push(point);
            deps.forceTick();
        }
    }
    return true;
}

export function updateTrimHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (deps.activeTool !== 'trim' || event.buttons !== 0) return false;
    const canvas = deps.canvasRef.current;
    if (!canvas) return false;
    const world = worldAtEvent(event, canvas, deps.cameraRef.current);
    const view = deps.viewRef.current;
    const best = findTrimTarget(
        view.loops,
        world,
        8,
        view.selected,
        view.hidden,
    );
    deps.onTrimHover(best);
    canvas.style.cursor = best ? 'crosshair' : '';
    deps.forceTick();
    return true;
}

export function handleTrimUp(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const brush = deps.trimBrushRef.current;
    if (!brush || event.button !== 0) return false;
    deps.trimBrushRef.current = null;
    deps.onTrimStroke?.(brush.points);
    deps.downRef.current = null;
    deps.forceTick();
    return true;
}

export function trimAt(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: { x: number; y: number } | null,
    marquee: unknown,
): boolean {
    if (
        deps.activeTool !== 'trim' ||
        !down ||
        marquee ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 6
    )
        return false;
    const canvas = deps.canvasRef.current;
    if (canvas)
        deps.onTrimAt?.(worldAtEvent(event, canvas, deps.cameraRef.current));
    deps.downRef.current = null;
    deps.forceTick();
    return true;
}
