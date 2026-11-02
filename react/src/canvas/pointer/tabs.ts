/**
 * Purpose: Implementation module for tabs in the canvas domain.
 */
import { nearestPointOnPolyline } from '../../cam/cam-ops.js';
import { findTabHover, findTabMarkerAtScreen } from '../tabInteraction';
import { worldAtEvent } from './helpers';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

export function handleTabDown(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const canvas = deps.canvasRef.current;
    const marker = canvas
        ? findTabMarkerAtScreen(
              deps.viewRef.current.tabMarkers,
              { x: event.clientX, y: event.clientY },
              canvas.getBoundingClientRect(),
              deps.cameraRef.current,
          )
        : undefined;
    if (!marker || (event.button !== 0 && event.button !== 2)) return false;
    deps.selectedTabRef.current = marker;
    if (event.button === 2) {
        deps.onDeleteTab(marker.entryId, marker.tabIndex);
        deps.selectedTabRef.current = null;
    } else {
        deps.tabDragRef.current = { marker, along: marker.along, moved: false };
    }
    event.preventDefault();
    deps.forceTick();
    return true;
}

export function handleTabMove(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const drag = deps.tabDragRef.current;
    if (!drag) return false;
    const canvas = deps.canvasRef.current;
    const contour =
        deps.viewRef.current.preview[drag.marker.previewIndex]?.points;
    if (canvas && contour && contour.length >= 2) {
        const hit = nearestPointOnPolyline(
            contour,
            worldAtEvent(event, canvas, deps.cameraRef.current),
        );
        if (hit) {
            drag.along = hit.along;
            if (
                Math.abs(hit.along - drag.marker.along) *
                    deps.cameraRef.current.scale >
                1
            )
                drag.moved = true;
            canvas.style.cursor = 'grabbing';
            deps.forceTick();
        }
    }
    return true;
}

export function handleTabUp(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const drag = deps.tabDragRef.current;
    if (!drag || event.button !== 0) return false;
    deps.tabDragRef.current = null;
    if (drag.moved)
        deps.onMoveTab(drag.marker.entryId, drag.marker.tabIndex, drag.along);
    const canvas = deps.canvasRef.current;
    if (canvas) canvas.style.cursor = '';
    deps.downRef.current = null;
    deps.forceTick();
    return true;
}

export function updateTabHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): void {
    if (!deps.viewRef.current.tabMode) {
        deps.tabHoverRef.current = null;
        return;
    }
    if (event.buttons !== 0) return;
    const canvas = deps.canvasRef.current;
    if (!canvas) return;
    const best = findTabHover(
        deps.viewRef.current.preview,
        worldAtEvent(event, canvas, deps.cameraRef.current),
        14 / deps.cameraRef.current.scale,
    );
    deps.tabHoverRef.current = best;
    canvas.style.cursor = best ? 'crosshair' : '';
}

export function placeTab(deps: CanvasPointerControllerProps): boolean {
    if (!deps.viewRef.current.tabMode) return false;
    const candidate = deps.tabHoverRef.current;
    if (candidate)
        deps.onPlaceTab(
            candidate.entryId,
            candidate.contourIndex,
            candidate.along,
        );
    deps.tabHoverRef.current = null;
    const canvas = deps.canvasRef.current;
    if (canvas) canvas.style.cursor = '';
    deps.forceTick();
    return true;
}
