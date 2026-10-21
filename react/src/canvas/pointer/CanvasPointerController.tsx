import { useRef, type PointerEvent as CanvasPointerEvent } from 'react';
/**
 * Purpose: Implementation module for CanvasPointerController in the canvas domain.
 */
import {
    clearDraggedDraft,
    finishDraw,
    updateChainCursor,
    updateDrawDraft,
} from './draw';
import { placeGuide, updateGuideHover, updateGuideInteraction } from './guides';
import { completePolylineOnDoubleClick, handleCanvasKeyDown } from './keyboard';
import {
    beginPan,
    finishSelection,
    movePan,
    updateMarquee,
    updateSelectionHover,
} from './selection';
import {
    handleTabDown,
    handleTabMove,
    handleTabUp,
    placeTab,
    updateTabHover,
} from './tabs';
import {
    handleCornerDown,
    handleTransformDown,
    handleTransformMove,
    handleTransformUp,
    updateCornerHover,
    updateTransformHover,
} from './transform';
import {
    handleTrimDown,
    handleTrimMove,
    handleTrimUp,
    trimAt,
    updateTrimHover,
} from './trim';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

// Deliberately a router: interaction modes own their event handling in sibling
// modules so canvas input remains easy to navigate and test independently.
export function CanvasPointerController(props: CanvasPointerControllerProps) {
    const touches = useRef(new Map<number, { x: number; y: number }>());
    const navigating = useRef(false);
    const gesture = () => {
        const [a, b] = [...touches.current.values()];
        return a && b
            ? {
                  x: (a.x + b.x) / 2,
                  y: (a.y + b.y) / 2,
                  distance: Math.hypot(a.x - b.x, a.y - b.y),
              }
            : null;
    };
    const handleDown = (event: CanvasMouseEvent) => {
        event.currentTarget.focus();
        props.downRef.current = { x: event.clientX, y: event.clientY };
        if (props.panMode && event.button === 0) {
            props.panRef.current = { x: event.clientX, y: event.clientY };
            event.preventDefault();
            return;
        }
        if (handleCornerDown(event, props)) return;
        if (handleTabDown(event, props)) return;
        props.selectedTabRef.current = null;
        if (handleTrimDown(event, props)) return;
        beginPan(event, props);
        handleTransformDown(event, props);
    };
    const handleMove = (event: CanvasMouseEvent) => {
        if (props.panMode && movePan(event, props)) return;
        props.progressPointerRef.current = {
            x: event.clientX,
            y: event.clientY,
        };
        updateGuideHover(event, props);
        updateSelectionHover(event, props);
        if (handleTabMove(event, props)) return;
        if (handleTrimMove(event, props)) return;
        if (handleTransformMove(event, props)) return;
        if (updateCornerHover(event, props)) return;
        updateTrimHover(event, props);
        updateTransformHover(event, props);
        if (movePan(event, props)) return;
        if (updateChainCursor(event, props)) return;
        props.updateCursor(event);
        if (updateGuideInteraction(event, props)) return;
        updateTabHover(event, props);
        props.forceTick();
        if (updateDrawDraft(event, props)) return;
        updateMarquee(event, props);
    };
    const handleUp = (event: CanvasMouseEvent) => {
        if (props.panMode) {
            props.downRef.current = null;
            props.panRef.current = null;
            props.marqueeRef.current = null;
            props.forceTick();
            return;
        }
        if (handleTabUp(event, props)) return;
        if (handleTrimUp(event, props)) return;
        const down = props.downRef.current;
        props.downRef.current = null;
        props.panRef.current = null;
        const marquee = props.marqueeRef.current;
        props.marqueeRef.current = null;
        props.draftRef.current = null;
        if (handleTransformUp(event, props)) return;
        if (event.button !== 0) {
            props.forceTick();
            return;
        }
        if (placeGuide(event, props, down, marquee)) return;
        if (trimAt(event, props, down, marquee)) return;
        if (finishDraw(event, props, down, marquee)) return;
        if (clearDraggedDraft(props)) return;
        if (placeTab(props)) return;
        finishSelection(event, props, down, marquee);
    };
    const cancelTouch = () => {
        props.downRef.current = null;
        props.panRef.current = null;
        props.tabDragRef.current = null;
        props.trimBrushRef.current = null;
        props.onViewportLeave();
    };
    const endTouch = (
        event: CanvasPointerEvent<HTMLCanvasElement>,
        cancelled = false,
    ) => {
        if (
            event.pointerType === 'mouse' ||
            !touches.current.has(event.pointerId)
        )
            return;
        event.preventDefault();
        touches.current.delete(event.pointerId);
        if (!navigating.current && !cancelled) handleUp(event);
        else cancelTouch();
        if (!touches.current.size) navigating.current = false;
    };
    return (
        <canvas
            ref={props.canvasRef}
            aria-label="Drawing canvas"
            className={`w-full h-full block ${props.panMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            data-testid="gcam-canvas"
            tabIndex={0}
            style={{ touchAction: 'none', userSelect: 'none' }}
            onKeyDown={(event) =>
                handleCanvasKeyDown(event, {
                    viewRef: props.viewRef,
                    clicksRef: props.clicksRef,
                    cursorRef: props.cursorRef,
                    draftRef: props.draftRef,
                    pendingAnchorRef: props.pendingAnchorRef,
                    selectedGuideRef: props.selectedGuideRef,
                    selectedTabRef: props.selectedTabRef,
                    transformDragRef: props.transformDragRef,
                    onDeleteTab: props.onDeleteTab,
                    onCancelGuide: props.onCancelGuide,
                    onDeleteGuide: props.onDeleteGuide,
                    onGuideDraftChange: props.onGuideDraftChange,
                    onTransformCommit: props.onTransformCommit,
                    onCommitLoop: props.onCommitLoop,
                    forceTick: props.forceTick,
                })
            }
            onDoubleClick={() =>
                completePolylineOnDoubleClick({
                    drawTool: props.viewRef.current.drawTool,
                    clicksRef: props.clicksRef,
                    cursorRef: props.cursorRef,
                    onCommitLoop: props.onCommitLoop,
                    forceTick: props.forceTick,
                })
            }
            onPointerDown={(event) => {
                if (event.pointerType === 'mouse') return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                touches.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                if (touches.current.size > 1) {
                    navigating.current = true;
                    cancelTouch();
                } else handleDown(event);
            }}
            onPointerMove={(event) => {
                if (
                    event.pointerType === 'mouse' ||
                    !touches.current.has(event.pointerId)
                )
                    return;
                event.preventDefault();
                const before = gesture();
                touches.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                const after = gesture();
                if (before && after) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    if (before.distance > 0 && after.distance > 0)
                        props.zoomBy(
                            after.distance / before.distance,
                            before.x - rect.left,
                            before.y - rect.top,
                        );
                    const camera = props.cameraRef.current;
                    props.cameraRef.current = {
                        ...camera,
                        tx: camera.tx + after.x - before.x,
                        ty: camera.ty + after.y - before.y,
                    };
                    props.forceTick();
                } else if (!navigating.current) handleMove(event);
            }}
            onPointerUp={(event) => endTouch(event)}
            onPointerCancel={(event) => endTouch(event, true)}
            onLostPointerCapture={(event) => {
                if (touches.current.has(event.pointerId)) endTouch(event, true);
            }}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={(event) => {
                // The floating dimension/guide controls are siblings of the
                // canvas inside its viewport. Keep the draft alive while the
                // pointer moves from the drawing surface into those controls.
                const viewport = event.currentTarget.parentElement;
                if (
                    event.relatedTarget instanceof Node &&
                    viewport?.contains(event.relatedTarget)
                )
                    return;
                props.onViewportLeave();
            }}
            onContextMenu={(event) => event.preventDefault()}
        />
    );
}
