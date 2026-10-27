import { zoomProfileAt } from './profileCamera';
import { useRef, type PointerEvent, type RefObject } from 'react';

type Point = { x: number; y: number };
function gesture(points: Map<number, Point>) {
    const [a, b] = [...points.values()];
    return a && b
        ? {
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              distance: Math.hypot(a.x - b.x, a.y - b.y),
          }
        : null;
}

/** Two-finger navigation owns its pointers until all fingers lift, preventing stray edits. */
export function useProfileGestures({
    svg,
    viewWidth = 360,
    viewHeight = 240,
    panY = 0,
    zoom,
    pan,
    onView,
    onInterrupt,
}: {
    svg: RefObject<SVGSVGElement | null>;
    viewWidth?: number;
    viewHeight?: number;
    panY?: number;
    zoom: number;
    pan: number;
    onView(zoom: number, pan: number, panY: number): void;
    onInterrupt(): void;
}) {
    const pointers = useRef(new Map<number, Point>());
    const navigating = useRef(false);
    const view = useRef({ zoom, pan, panY });
    view.current = { zoom, pan, panY };
    return {
        begin(event: PointerEvent) {
            if (event.pointerType === 'mouse') return false;
            pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
            if (pointers.current.size >= 2) {
                navigating.current = true;
                onInterrupt();
            }
            return navigating.current;
        },
        move(event: PointerEvent) {
            if (!pointers.current.has(event.pointerId)) return false;
            const before = gesture(pointers.current);
            pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
            const after = gesture(pointers.current),
                rect = svg.current?.getBoundingClientRect();
            if (navigating.current && before && after && rect?.width) {
                const x = ((before.x - rect.left) * viewWidth) / rect.width;
                const y =
                    ((before.y - (rect.top || 0)) * viewHeight) /
                    (rect.height || viewHeight);
                const next = zoomProfileAt(
                    view.current.zoom,
                    view.current.pan,
                    view.current.panY,
                    (view.current.zoom * after.distance) /
                        Math.max(1, before.distance),
                    x,
                    y,
                    viewHeight,
                );
                next.panX -= ((after.x - before.x) * viewWidth) / rect.width;
                next.panY +=
                    ((after.y - before.y) * viewHeight) /
                    (rect.height || viewHeight);
                view.current = {
                    zoom: next.zoom,
                    pan: next.panX,
                    panY: next.panY,
                };
                onView(next.zoom, next.panX, next.panY);
            }
            return navigating.current;
        },
        end(event: PointerEvent) {
            const consumed = navigating.current;
            pointers.current.delete(event.pointerId);
            if (!pointers.current.size) navigating.current = false;
            return consumed;
        },
    };
}
