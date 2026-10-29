/**
 * Purpose: Implementation module for draw in the canvas domain.
 */
import {
    arcPoints3,
    cubicBezierPoints,
    defaultArcBulgePoint,
    draftPoints,
} from '../../draw/geometry';
import {
    constrainDrawAngle,
    findDrawSnapTarget,
    snapDrawPoint,
} from '../selectionGeometry';
import { worldAtEvent } from './helpers';
import type {
    CanvasMouseEvent,
    CanvasPointerControllerProps,
    Point,
} from './types';

const CLICK_TO_DRAW = new Set([
    'line',
    'rectangle',
    'rounded-rectangle',
    'ellipse',
    'polygon',
    'circle',
]);
const CHAIN_TO_DRAW = new Set(['arc', 'bezier', 'polyline']);

function snapped(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    anchor?: Point | null,
): Point | null {
    const canvas = deps.canvasRef.current;
    if (!canvas) return null;
    const view = deps.viewRef.current;
    const world = worldAtEvent(event, canvas, deps.cameraRef.current);
    const target = findDrawSnapTarget(
        view.loops,
        view.hidden,
        world,
        deps.cameraRef.current.scale,
        view.grid,
        view.guides,
    );
    if (
        event.shiftKey &&
        anchor &&
        view.drawTool &&
        ['line', 'polyline', 'polygon'].includes(view.drawTool)
    ) {
        if (
            target &&
            ['endpoint', 'midpoint', 'edge', 'origin'].includes(target.kind)
        ) {
            deps.angleSnapRef.current = null;
            return target.point;
        }
        const dx = world.x - anchor.x;
        const dy = world.y - anchor.y;
        deps.angleSnapRef.current =
            Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 15) * 15;
        return constrainDrawAngle(world, anchor, 15);
    }
    deps.angleSnapRef.current = null;
    return target?.point ?? world;
}

function snappedScreenPoint(
    client: Point,
    deps: CanvasPointerControllerProps,
): Point | null {
    const canvas = deps.canvasRef.current;
    if (!canvas) return null;
    const view = deps.viewRef.current;
    return snapDrawPoint(
        view.loops,
        view.hidden,
        worldAtEvent(
            { clientX: client.x, clientY: client.y } as CanvasMouseEvent,
            canvas,
            deps.cameraRef.current,
        ),
        deps.cameraRef.current.scale,
        view.grid,
        view.guides,
    );
}

export function updateDrawDraft(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || tool === 'text' || tool === 'mandala') {
        deps.angleSnapRef.current = null;
        return false;
    }
    if (
        CLICK_TO_DRAW.has(tool) &&
        deps.pendingAnchorRef.current &&
        event.buttons !== 1
    ) {
        const anchor = deps.pendingAnchorRef.current;
        const point = snapped(event, deps, anchor);
        if (point && anchor)
            deps.draftRef.current = {
                ...deps.draftRef.current,
                ax: anchor.x,
                ay: anchor.y,
                bx: point.x,
                by: point.y,
            };
        deps.forceTick();
        return true;
    }
    if (tool === 'slot' && deps.clicksRef.current.length) {
        const start = deps.clicksRef.current[0];
        const point = snapped(event, deps, start);
        if (!point) return true;
        const end = deps.clicksRef.current[1] ?? point;
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const width =
            deps.clicksRef.current.length === 2 && length > 0
                ? (2 *
                      Math.abs(
                          (end.x - start.x) * (point.y - start.y) -
                              (end.y - start.y) * (point.x - start.x),
                      )) /
                  length
                : (deps.draftRef.current?.slotWidth ?? 10);
        deps.draftRef.current = {
            ax: start.x,
            ay: start.y,
            bx: end.x,
            by: end.y,
            slotWidth: width,
        };
        deps.forceTick();
        return true;
    }
    const down = deps.downRef.current;
    if (!down || event.buttons !== 1) return false;
    const canvas = deps.canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const camera = deps.cameraRef.current;
    const start = snappedScreenPoint(down, deps);
    const end = snapped(event, deps, start);
    deps.draftRef.current = {
        ...deps.draftRef.current,
        ax: start?.x ?? (down.x - rect.left - camera.tx) / camera.scale,
        ay: start?.y ?? (camera.ty - (down.y - rect.top)) / camera.scale,
        bx: end?.x ?? (event.clientX - rect.left - camera.tx) / camera.scale,
        by: end?.y ?? (camera.ty - (event.clientY - rect.top)) / camera.scale,
    };
    deps.forceTick();
    return true;
}

export function updateChainCursor(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || !CHAIN_TO_DRAW.has(tool) || !deps.clicksRef.current.length)
        return false;
    deps.updateCursor(event);
    const clicks = deps.clicksRef.current;
    const anchor = clicks[clicks.length - 1];
    const point = snapped(event, deps, anchor);
    if (point) deps.cursorRef.current = point;
    deps.forceTick();
    return true;
}

export function finishDraw(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: Point | null,
    marquee: unknown,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || !down || marquee) return false;
    const dragged =
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 4;
    if (tool === 'text' || tool === 'mandala') {
        const clicks = deps.clicksRef.current;
        const point = snapped(event, deps, clicks[clicks.length - 1]);
        if (point) {
            if (tool === 'mandala') deps.onCommitMandala?.(point);
            else deps.onCommitText(point);
        }
        deps.forceTick();
        return true;
    }
    if (CHAIN_TO_DRAW.has(tool)) {
        const clicks = deps.clicksRef.current;
        const point = snapped(event, deps, clicks[clicks.length - 1]);
        if (point) {
            const chain = [...deps.clicksRef.current, point];
            deps.clicksRef.current = chain;
            if (tool === 'arc' && chain.length >= 3) {
                const arc = arcPoints3(chain[0], chain[2], chain[1]);
                deps.clicksRef.current = [];
                deps.cursorRef.current = null;
                if (arc) deps.onCommitLoop(arc);
            }
            if (tool === 'arc' && chain.length === 2)
                deps.cursorRef.current = defaultArcBulgePoint(
                    chain[0],
                    chain[1],
                );
            if (tool === 'bezier' && chain.length >= 4) {
                deps.clicksRef.current = [];
                deps.onCommitLoop(
                    cubicBezierPoints(chain[0], chain[1], chain[2], chain[3]),
                );
            }
        }
        deps.forceTick();
        return true;
    }
    if (tool === 'slot') {
        const point = snapped(event, deps, deps.clicksRef.current[0]);
        if (!point) return true;
        const clicks = deps.clicksRef.current;
        if (!clicks.length) {
            deps.clicksRef.current = [point];
            deps.pendingAnchorRef.current = point;
            deps.draftRef.current = {
                ax: point.x,
                ay: point.y,
                bx: point.x,
                by: point.y,
                slotWidth: 10,
            };
        } else if (clicks.length === 1) {
            if (
                Math.hypot(point.x - clicks[0].x, point.y - clicks[0].y) >= 0.01
            ) {
                deps.clicksRef.current = [clicks[0], point];
                deps.draftRef.current = {
                    ax: clicks[0].x,
                    ay: clicks[0].y,
                    bx: point.x,
                    by: point.y,
                    slotWidth: deps.draftRef.current?.slotWidth ?? 10,
                };
            }
        } else {
            updateDrawDraft(event, deps);
            const points = draftPoints(tool, deps.draftRef.current);
            if (points) {
                deps.onCommitLoop(points, { sourceType: 'slot' });
                deps.clicksRef.current = [];
                deps.pendingAnchorRef.current = null;
                deps.draftRef.current = null;
            }
        }
        deps.forceTick();
        return true;
    }
    if (!CLICK_TO_DRAW.has(tool)) return false;
    if (dragged) {
        const start = snappedScreenPoint(down, deps);
        const end = snapped(event, deps, start);
        if (!start || !end) return false;
        const view = deps.viewRef.current;
        const points = draftPoints(
            tool,
            {
                ...deps.draftRef.current,
                ax: start.x,
                ay: start.y,
                bx: end.x,
                by: end.y,
            },
            view.drawSides,
            null,
            view.polygonMode,
        );
        deps.pendingAnchorRef.current = null;
        deps.draftRef.current = null;
        deps.angleSnapRef.current = null;
        if (points && points.length >= 2) {
            const radius = Math.hypot(end.x - start.x, end.y - start.y);
            deps.onCommitLoop(points, {
                sourceType: tool,
                ...(tool === 'circle' ? { radius } : {}),
                ...(tool === 'polygon'
                    ? {
                          radius,
                          sides: Math.round(view.drawSides),
                          polygonMode: view.polygonMode,
                      }
                    : {}),
            });
        }
        deps.forceTick();
        return true;
    }
    const anchor = deps.pendingAnchorRef.current;
    const point = snapped(event, deps, anchor);
    if (point) {
        const anchor = deps.pendingAnchorRef.current;
        if (!anchor) {
            deps.pendingAnchorRef.current = point;
            deps.draftRef.current = {
                ax: point.x,
                ay: point.y,
                bx: point.x,
                by: point.y,
            };
        } else {
            const view = deps.viewRef.current;
            const points = draftPoints(
                tool,
                {
                    ...deps.draftRef.current,
                    ax: anchor.x,
                    ay: anchor.y,
                    bx: point.x,
                    by: point.y,
                },
                view.drawSides,
                null,
                view.polygonMode,
            );
            deps.pendingAnchorRef.current = null;
            deps.draftRef.current = null;
            deps.angleSnapRef.current = null;
            if (points && points.length >= 2) {
                const radius = Math.hypot(
                    point.x - anchor.x,
                    point.y - anchor.y,
                );
                deps.onCommitLoop(points, {
                    sourceType: tool,
                    ...(tool === 'circle' ? { radius } : {}),
                    ...(tool === 'polygon'
                        ? {
                              radius,
                              sides: Math.round(view.drawSides),
                              polygonMode: view.polygonMode,
                          }
                        : {}),
                });
            }
        }
    }
    deps.forceTick();
    return true;
}

export function clearDraggedDraft(deps: CanvasPointerControllerProps): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || !CLICK_TO_DRAW.has(tool)) return false;
    const anchor = deps.pendingAnchorRef.current;
    deps.draftRef.current = anchor
        ? { ax: anchor.x, ay: anchor.y, bx: anchor.x, by: anchor.y }
        : null;
    deps.forceTick();
    return true;
}
