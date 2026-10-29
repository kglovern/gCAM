/** Pointer interaction for parallel construction-guide placement. */
import {
    findGuideAtPoint,
    findGuideSource,
    type GuideDraft,
} from '../../lib/guides';
import { movedFrom, worldAtEvent } from './helpers';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

function draftAtOffset(draft: GuideDraft, offset: number): GuideDraft {
    return { ...draft, offset };
}

function offsetAtEvent(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    draft: GuideDraft,
): number {
    const canvas = deps.canvasRef.current;
    if (!canvas) return draft.offset;
    const world = worldAtEvent(event, canvas, deps.cameraRef.current);
    const normal = { x: -draft.direction.y, y: draft.direction.x };
    let offset =
        (world.x - draft.source.x) * normal.x +
        (world.y - draft.source.y) * normal.y;
    const { grid } = deps.viewRef.current;
    if (grid.snap && grid.spacingMm > 0) {
        offset = Math.round(offset / grid.spacingMm) * grid.spacingMm;
    }
    return offset;
}

export function updateGuideHover(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps & {
        guideHoverRef?: { current: string | null };
    },
): void {
    const { viewRef, guideHoverRef, canvasRef, cameraRef } = deps;
    if (!guideHoverRef) return;
    if (
        deps.activeTool !== 'select' ||
        viewRef.current.drawTool ||
        viewRef.current.guidePlacement
    ) {
        guideHoverRef.current = null;
        return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = worldAtEvent(event, canvas, cameraRef.current);
    guideHoverRef.current =
        findGuideAtPoint(world, viewRef.current.guides, cameraRef.current.scale)
            ?.id ?? null;
}

export function updateGuideInteraction(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    if (deps.viewRef.current.guidePlacement !== 'edge') return false;
    deps.updateCursor(event);
    const draft = deps.viewRef.current.guideDraft;
    if (draft && deps.canvasRef.current) {
        deps.onGuideDraftChange({
            ...draftAtOffset(draft, offsetAtEvent(event, deps, draft)),
            cursor: worldAtEvent(
                event,
                deps.canvasRef.current,
                deps.cameraRef.current,
            ),
        });
    }
    deps.forceTick();
    return true;
}

export function placeGuide(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: { x: number; y: number } | null,
    marquee: unknown,
): boolean {
    if (deps.viewRef.current.guidePlacement !== 'edge') return false;
    if (!down || marquee || movedFrom(event, down, 6)) return true;
    const draft = deps.viewRef.current.guideDraft;
    if (!draft) {
        const canvas = deps.canvasRef.current;
        if (canvas) {
            const world = worldAtEvent(event, canvas, deps.cameraRef.current);
            const source = findGuideSource(
                world,
                deps.viewRef.current.loops,
                deps.viewRef.current.hidden,
                deps.cameraRef.current.scale,
            );
            if (source) {
                deps.onGuideDraftChange({
                    source: source.point,
                    direction: source.direction,
                    sourceLabel: source.label,
                    offset: 0,
                });
            }
        }
        deps.forceTick();
        return true;
    }

    const finalDraft = draftAtOffset(draft, offsetAtEvent(event, deps, draft));
    const normal = { x: -draft.direction.y, y: draft.direction.x };
    deps.onPlaceGuide({
        point: {
            x: draft.source.x + normal.x * finalDraft.offset,
            y: draft.source.y + normal.y * finalDraft.offset,
        },
        direction: draft.direction,
    });
    deps.forceTick();
    return true;
}
