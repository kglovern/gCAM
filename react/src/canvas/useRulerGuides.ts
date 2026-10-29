import { useRef, type PointerEvent, type RefObject } from 'react';
import type { GuideDraft, GuidePlacement } from '../lib/guides';
import type { Camera } from './types';

/** Drag a construction guide from a ruler; release over the ruler or drawing to place it. */
export function useRulerGuides({
    canvasRef,
    cameraRef,
    grid,
    enabled,
    onDraft,
    onPlace,
    onCancel,
}: {
    canvasRef: RefObject<HTMLCanvasElement>;
    cameraRef: RefObject<Camera>;
    grid: { snap: boolean };
    enabled: boolean;
    onDraft(draft: GuideDraft): void;
    onPlace(guide: GuidePlacement): void;
    onCancel(): void;
}) {
    const drag = useRef<{
        axis: 'x' | 'y';
        pointerId: number;
        rulerBounds: DOMRect;
    } | null>(null);
    const cancel = () => {
        if (!drag.current) return;
        drag.current = null;
        onCancel();
    };
    const at = (event: PointerEvent<HTMLCanvasElement>, axis: 'x' | 'y') => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const camera = cameraRef.current!;
        let offset =
            axis === 'x'
                ? (camera.ty - (event.clientY - rect.top)) / camera.scale
                : -(event.clientX - rect.left - camera.tx) / camera.scale;
        if (grid.snap) offset = Math.round(offset);
        return {
            cursor: {
                x: (event.clientX - rect.left - camera.tx) / camera.scale,
                y: (camera.ty - (event.clientY - rect.top)) / camera.scale,
            },
            source: { x: 0, y: 0 },
            direction: axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 },
            sourceLabel: axis === 'x' ? 'Left ruler' : 'Top ruler',
            offset,
        };
    };
    return (ruler: 'top' | 'left') => {
        const axis = ruler === 'top' ? 'y' : 'x';
        return {
            onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
                if (!enabled || event.button !== 0 || !canvasRef.current)
                    return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                    axis,
                    pointerId: event.pointerId,
                    rulerBounds: event.currentTarget.getBoundingClientRect(),
                };
                onDraft(at(event, axis));
            },
            onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
                if (drag.current?.pointerId === event.pointerId)
                    onDraft(at(event, drag.current.axis));
            },
            onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
                if (drag.current?.pointerId !== event.pointerId) return;
                const rect = canvasRef.current!.getBoundingClientRect();
                const draft = at(event, drag.current.axis);
                const ruler = drag.current.rulerBounds;
                const overRuler =
                    event.clientX >= ruler.left &&
                    event.clientX <= ruler.right &&
                    event.clientY >= ruler.top &&
                    event.clientY <= ruler.bottom;
                drag.current = null;
                if (
                    !overRuler &&
                    (event.clientX < rect.left ||
                        event.clientX > rect.right ||
                        event.clientY < rect.top ||
                        event.clientY > rect.bottom)
                ) {
                    onCancel();
                    return;
                }
                onPlace({
                    point: {
                        x: -draft.direction.y * draft.offset,
                        y: draft.direction.x * draft.offset,
                    },
                    direction: draft.direction,
                });
            },
            onPointerCancel: cancel,
            onLostPointerCapture: cancel,
            onKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
                if (event.key === 'Escape') cancel();
            },
        };
    };
}
