import { useRef, type PointerEvent, type RefObject } from 'react';

type Point = { x: number; y: number };
function gesture(points: Map<number, Point>) {
    const [a, b] = [...points.values()];
    return a && b
        ? { x: (a.x + b.x) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
        : null;
}

/** Two-finger navigation owns its pointers until all fingers lift, preventing stray edits. */
export function useProfileGestures({
    svg,
    viewWidth = 360,
    zoom,
    pan,
    onView,
    onInterrupt,
}: {
    svg: RefObject<SVGSVGElement | null>;
    viewWidth?: number;
    zoom: number;
    pan: number;
    onView(zoom: number, pan: number): void;
    onInterrupt(): void;
}) {
    const pointers = useRef(new Map<number, Point>());
    const navigating = useRef(false);
    const view = useRef({ zoom, pan });
    view.current = { zoom, pan };
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
                const nextZoom = Math.max(
                    0.5,
                    Math.min(
                        3,
                        (view.current.zoom * after.distance) /
                            Math.max(1, before.distance),
                    ),
                );
                const previousX =
                    ((before.x - rect.left) * viewWidth) / rect.width - 34;
                const currentX =
                    ((after.x - rect.left) * viewWidth) / rect.width - 34;
                const nextPan = Math.max(
                    0,
                    ((previousX + view.current.pan) * nextZoom) /
                        view.current.zoom -
                        currentX,
                );
                view.current = { zoom: nextZoom, pan: nextPan };
                onView(nextZoom, nextPan);
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
