/**
 * Purpose: Implementation module for transform in the canvas domain.
 */
import {
    findFilletCorner,
    hitTransformTarget,
    selectionFrame,
} from '../selectionGeometry';
import { beginTransformDrag } from '../transformInteraction';
import { worldAtEvent } from './helpers';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

export function handleCornerDown(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (!deps.viewRef.current.cornerTool || event.button !== 0) return false;
    const canvas = deps.canvasRef.current;
    if (canvas) {
        const hover = findFilletCorner(
            deps.viewRef.current.loops,
            deps.viewRef.current.cornerTool === 'dogbone'
                ? []
                : deps.viewRef.current.selected,
            deps.viewRef.current.hidden,
            worldAtEvent(event, canvas, deps.cameraRef.current),
            deps.cameraRef.current.scale,
            deps.viewRef.current.cornerTool !== 'dogbone',
        );
        if (hover)
            deps.onFilletCorner?.(
                hover.loopId,
                hover.index,
                hover.intersection,
            );
    }
    deps.cornerHoverRef.current = null;
    event.preventDefault();
    // A corner edit consumes the click; mouse-up must not reselect the old corner.
    deps.downRef.current = null;
    deps.forceTick();
    return true;
}

export function handleTransformDown(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (event.button !== 0 || event.altKey) return false;
    const mode = deps.viewRef.current.transformMode;
    const canvas = deps.canvasRef.current;
    if (!mode || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const started = beginTransformDrag({
        mode,
        loops: deps.viewRef.current.loops,
        selected: deps.viewRef.current.selected,
        hidden: deps.viewRef.current.hidden,
        camera: deps.cameraRef.current,
        screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    });
    if (!started) return false;
    deps.transformDragRef.current = started.drag;
    try {
        const withPointer = event as unknown as { pointerId?: number };
        if (typeof withPointer.pointerId === 'number')
            event.currentTarget.setPointerCapture(withPointer.pointerId);
    } catch {
        /* pointer capture is optional */
    }
    canvas.style.cursor = started.cursor;
    event.preventDefault();
    deps.forceTick();
    return true;
}

export function handleTransformMove(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const drag = deps.transformDragRef.current;
    const canvas = deps.canvasRef.current;
    if (!drag || !canvas) return false;
    const camera = deps.cameraRef.current;
    const world = worldAtEvent(event, canvas, camera);
    if (
        Math.hypot(
            event.clientX - (drag.startWorld.x * camera.scale + camera.tx),
            event.clientY - (camera.ty - drag.startWorld.y * camera.scale),
        ) > 2
    )
        drag.moved = true;
    if (drag.mode === 'move') {
        drag.dx = world.x - drag.startWorld.x;
        drag.dy = world.y - drag.startWorld.y;
    } else if (drag.mode === 'rotate') {
        const a0 = Math.atan2(
            drag.startWorld.y - drag.center.y,
            drag.startWorld.x - drag.center.x,
        );
        const a1 = Math.atan2(world.y - drag.center.y, world.x - drag.center.x);
        drag.deg = ((a1 - a0) * 180) / Math.PI;
    } else {
        const d0 =
            Math.hypot(
                drag.startWorld.x - drag.anchor.x,
                drag.startWorld.y - drag.anchor.y,
            ) || 1;
        drag.factor = Math.max(
            0.02,
            Math.hypot(world.x - drag.anchor.x, world.y - drag.anchor.y) / d0,
        );
    }
    deps.forceTick();
    return true;
}

export function updateCornerHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (!deps.viewRef.current.cornerTool || event.buttons !== 0) return false;
    const canvas = deps.canvasRef.current;
    if (!canvas) return false;
    deps.cornerHoverRef.current = findFilletCorner(
        deps.viewRef.current.loops,
        deps.viewRef.current.cornerTool === 'dogbone'
            ? []
            : deps.viewRef.current.selected,
        deps.viewRef.current.hidden,
        worldAtEvent(event, canvas, deps.cameraRef.current),
        deps.cameraRef.current.scale,
        deps.viewRef.current.cornerTool !== 'dogbone',
    );
    canvas.style.cursor = deps.cornerHoverRef.current ? 'crosshair' : '';
    deps.updateCursor(event);
    deps.forceTick();
    return true;
}

export function updateTransformHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): void {
    const { transformMode, drawTool, loops, selected, hidden } =
        deps.viewRef.current;
    if (!transformMode || drawTool || event.buttons !== 0) return;
    const canvas = deps.canvasRef.current;
    if (!canvas) return;
    const frame = selectionFrame(loops, selected, hidden);
    if (!frame) return;
    const rect = canvas.getBoundingClientRect();
    const camera = deps.cameraRef.current;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const hit = hitTransformTarget(
        transformMode,
        frame,
        (x, y) => ({
            x: camera.tx + x * camera.scale,
            y: camera.ty - y * camera.scale,
        }),
        sx,
        sy,
        {
            x: (sx - camera.tx) / camera.scale,
            y: (camera.ty - sy) / camera.scale,
        },
        loops,
        selected,
        hidden,
        camera.scale,
    );
    canvas.style.cursor = hit?.cursor ?? '';
}

export function handleTransformUp(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const finished = deps.transformDragRef.current;
    if (!finished || event.button !== 0) return false;
    deps.transformDragRef.current = null;
    const canvas = deps.canvasRef.current;
    if (canvas) canvas.style.cursor = '';
    if (!finished.moved) {
        deps.forceTick();
        return true;
    }
    if (finished.mode === 'move')
        deps.onTransformCommit({
            type: 'move',
            dx: finished.dx,
            dy: finished.dy,
        });
    else if (finished.mode === 'rotate')
        deps.onTransformCommit({
            type: 'rotate',
            degrees: finished.deg,
            about: finished.center,
        });
    else
        deps.onTransformCommit({
            type: 'scale',
            factor: finished.factor,
            about: finished.anchor,
        });
    deps.forceTick();
    return true;
}
