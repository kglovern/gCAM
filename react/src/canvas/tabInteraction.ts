/**
 * Purpose: Implementation module for tabInteraction in the canvas domain.
 */
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    nearestPointOnPolyline,
} from '../cam/cam-ops.js';
import { pointAtDistance, polylineLength } from '../geometry/primitives.js';
import type { CanvasCamera } from './camera';
import { polylineSlice } from './sceneRenderer';
import type { PreviewLoop, TabHoverCandidate, TabMarker } from './types';

type Point = { x: number; y: number };

/** Find the closest valid tab placement, independent from browser events. */
export function findTabHover(
    preview: PreviewLoop[],
    world: Point,
    tolerance: number,
): TabHoverCandidate | null {
    const seen = new Map<string, number>();
    let best: (TabHoverCandidate & { distance: number }) | null = null;
    preview.forEach((contour, previewIndex) => {
        const contourIndex = seen.get(contour.entryId) ?? 0;
        seen.set(contour.entryId, contourIndex + 1);
        if (contour.tabEligible === false || contour.points.length < 2) return;
        const hit = nearestPointOnPolyline(contour.points, world);
        if (!hit || hit.distance > tolerance) return;
        const toolDiameter =
            Number(contour.toolDiameter) > 0 ? Number(contour.toolDiameter) : 6;
        const tabWidth =
            Number(contour.tabWidth) > 0 ? Number(contour.tabWidth) : 9;
        const span =
            contour.tabSpan ??
            getTabCenterlineSpan(
                Math.max(tabWidth, getMinimumTabWidth(toolDiameter)),
                toolDiameter,
            );
        const total = polylineLength(contour.points);
        const start = pointAtDistance(
            contour.points,
            Math.max(0, hit.along - span / 2),
        );
        const end = pointAtDistance(
            contour.points,
            Math.min(total, hit.along + span / 2),
        );
        const center = pointAtDistance(contour.points, hit.along);
        if (
            !start ||
            !end ||
            !center ||
            (best && hit.distance >= best.distance)
        ) {
            return;
        }
        best = {
            entryId: contour.entryId,
            previewIndex,
            contourIndex,
            along: hit.along,
            start,
            end,
            center,
            spine: polylineSlice(
                contour.points,
                Math.max(0, hit.along - span / 2),
                Math.min(total, hit.along + span / 2),
            ),
            toolDiameter,
            distance: hit.distance,
        };
    });
    return best;
}

export function findTabMarkerAtScreen(
    markers: TabMarker[],
    client: Point,
    rect: Pick<DOMRect, 'left' | 'top'>,
    camera: CanvasCamera,
    radius = 10,
): TabMarker | undefined {
    return markers.find((marker) => {
        const x = camera.tx + marker.x * camera.scale + rect.left;
        const y = camera.ty - marker.y * camera.scale + rect.top;
        return Math.hypot(client.x - x, client.y - y) <= radius;
    });
}
