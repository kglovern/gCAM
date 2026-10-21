/**
 * Purpose: Implementation module for selection in the canvas domain.
 */
import { nearestPointOnPolyline } from '../../cam/cam-ops.js';
import { findGuideAtPoint } from '../../lib/guides';
import { findLoopAtPoint } from '../selectionGeometry';
import { startsPan } from '../pointerState';
import { matchesMarquee } from '../marqueeGeometry';
import type {
    CanvasMouseEvent,
    CanvasPointerControllerProps,
    Point,
} from './types';

export function beginPan(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (!startsPan(event.button, event.altKey)) return false;
    deps.panRef.current = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    return true;
}

export function movePan(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const start = deps.panRef.current;
    if (!start) return false;
    const camera = deps.cameraRef.current;
    deps.cameraRef.current = {
        ...camera,
        tx: camera.tx + event.clientX - start.x,
        ty: camera.ty + event.clientY - start.y,
    };
    deps.panRef.current = { x: event.clientX, y: event.clientY };
    deps.updateCursor(event);
    deps.forceTick();
    return true;
}

export function updateMarquee(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const down = deps.downRef.current;
    const canvas = deps.canvasRef.current;
    if (!down || !canvas || event.buttons !== 1) return false;
    const rect = canvas.getBoundingClientRect();
    const origin = { x: down.x - rect.left, y: down.y - rect.top };
    const current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
    if (Math.hypot(current.x - origin.x, current.y - origin.y) <= 4)
        return false;
    deps.marqueeRef.current = {
        x0: origin.x,
        y0: origin.y,
        x1: current.x,
        y1: current.y,
    };
    deps.forceTick();
    return true;
}

function selectMarquee(
    deps: CanvasPointerControllerProps,
    marquee: { x0: number; y0: number; x1: number; y1: number },
    additive: boolean,
): void {
    const camera = deps.cameraRef.current;
    const toWorld = (x: number, y: number): Point => ({
        x: (x - camera.tx) / camera.scale,
        y: (camera.ty - y) / camera.scale,
    });
    const a = toWorld(
        Math.min(marquee.x0, marquee.x1),
        Math.max(marquee.y0, marquee.y1),
    );
    const b = toWorld(
        Math.max(marquee.x0, marquee.x1),
        Math.min(marquee.y0, marquee.y1),
    );
    const hidden = new Set(deps.viewRef.current.hidden);
    const hits = deps.viewRef.current.loops.flatMap((loop) => {
        if (
            loop.bitmapId ||
            hidden.has(loop.id) ||
            !Array.isArray(loop.points) ||
            loop.points.length < 2
        )
            return [];
        try {
            return matchesMarquee(loop.points, a, b, marquee.x1 < marquee.x0)
                ? [loop.id]
                : [];
        } catch {
            return [];
        }
    });
    deps.onSelect(
        additive
            ? Array.from(
                  new Set([
                      ...deps.viewRef.current.selected.filter((id) => {
                          const loop = deps.viewRef.current.loops.find(
                              (item) => item.id === id,
                          );
                          return loop && !loop.bitmapId;
                      }),
                      ...hits,
                  ]),
              )
            : hits,
    );
}

function selectAt(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: Point,
): void {
    if (
        deps.viewRef.current.drawTool ||
        event.button !== 0 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 4
    )
        return;
    const canvas = deps.canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const camera = deps.cameraRef.current;
    const world = {
        x: (event.clientX - rect.left - camera.tx) / camera.scale,
        y: (camera.ty - (event.clientY - rect.top)) / camera.scale,
    };
    const { loops, selected, hidden, bitmaps } = deps.viewRef.current;
    const guide = findGuideAtPoint(
        world,
        deps.viewRef.current.guides ?? [],
        camera.scale,
    );
    if (guide) {
        const additive =
            deps.additiveSelection ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey;
        deps.selectedGuideRef.current =
            additive && deps.selectedGuideRef.current === guide.id
                ? null
                : guide.id;
        deps.onSelect([]);
        return;
    }
    const hide = new Set(hidden);
    const bitmap = [...bitmaps].reverse().find((entry) => {
        const linked = loops.find((loop) => loop.bitmapId === entry.id);
        if (!linked || hide.has(linked.id)) return false;
        const angle = ((entry.rotation ?? 0) * Math.PI) / 180;
        const cx = entry.x + entry.w / 2;
        const cy = entry.y + entry.h / 2;
        const dx = world.x - cx;
        const dy = world.y - cy;
        const localX = cx + dx * Math.cos(angle) + dy * Math.sin(angle);
        const localY = cy - dx * Math.sin(angle) + dy * Math.cos(angle);
        return (
            localX >= entry.x &&
            localX <= entry.x + entry.w &&
            localY >= entry.y &&
            localY <= entry.y + entry.h
        );
    });
    if (bitmap) {
        const linkedId = loops.find((loop) => loop.bitmapId === bitmap.id)?.id;
        if (linkedId) {
            deps.selectedGuideRef.current = null;
            deps.onSelect(
                (deps.additiveSelection ||
                    event.shiftKey ||
                    event.ctrlKey ||
                    event.metaKey) &&
                    selected.length === 1 &&
                    selected[0] === linkedId
                    ? []
                    : [linkedId],
            );
            return;
        }
    }
    const tolerance = 10 / camera.scale;
    let best: string | null = null;
    let bestDistance = Infinity;
    loops.forEach((loop) => {
        if (
            hide.has(loop.id) ||
            !Array.isArray(loop.points) ||
            loop.points.length < 2
        )
            return;
        try {
            const hit = nearestPointOnPolyline(loop.points, world);
            if (hit && hit.distance < bestDistance) {
                bestDistance = hit.distance;
                best = loop.id;
            }
        } catch {
            /* ignore malformed imported geometry */
        }
    });
    if (best !== null && bestDistance <= tolerance) {
        deps.selectedGuideRef.current = null;
        deps.onSelect(
            !(
                deps.additiveSelection ||
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey
            )
                ? [best]
                : selected.includes(best)
                  ? selected.filter((id) => id !== best)
                  : [...selected, best],
        );
    } else if (
        !(
            deps.additiveSelection ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey
        )
    ) {
        deps.selectedGuideRef.current = null;
        deps.onSelect([]);
    }
}

export function updateSelectionHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): void {
    const view = deps.viewRef.current;
    if (
        deps.activeTool !== 'select' ||
        view.drawTool ||
        view.guidePlacement ||
        view.transformMode ||
        event.buttons !== 0 ||
        deps.guideHoverRef.current
    ) {
        deps.loopHoverRef.current = null;
        return;
    }
    const canvas = deps.canvasRef.current;
    if (!canvas) return;
    const world = {
        x:
            (event.clientX -
                canvas.getBoundingClientRect().left -
                deps.cameraRef.current.tx) /
            deps.cameraRef.current.scale,
        y:
            (deps.cameraRef.current.ty -
                (event.clientY - canvas.getBoundingClientRect().top)) /
            deps.cameraRef.current.scale,
    };
    const hit = findLoopAtPoint(
        view.loops,
        view.hidden,
        world,
        deps.cameraRef.current.scale,
    );
    deps.loopHoverRef.current = hit
        ? { loopId: hit.loopId, segmentIndex: hit.segmentIndex }
        : null;
}

export function finishSelection(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: Point | null,
    marquee: { x0: number; y0: number; x1: number; y1: number } | null,
): void {
    if (marquee) {
        selectMarquee(
            deps,
            marquee,
            deps.additiveSelection ||
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey,
        );
        deps.forceTick();
    } else if (down) selectAt(event, deps, down);
}
