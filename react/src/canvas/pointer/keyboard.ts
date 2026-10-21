/**
 * Purpose: Implementation module for keyboard in the canvas domain.
 */
import type React from 'react';
import type { TransformCommit } from '../../lib/transform';
import type { LoopMeta, TabMarker } from '../types';

type Point = { x: number; y: number };

type KeyboardView = {
    guidePlacement: 'edge' | null;
    guideDraft: import('../../lib/guides').GuideDraft | null;
    transformMode: unknown;
    drawTool: string | null;
};

export function handleCanvasKeyDown(
    event: React.KeyboardEvent<HTMLCanvasElement>,
    deps: {
        viewRef: { current: KeyboardView };
        clicksRef: { current: Point[] };
        cursorRef: { current: Point | null };
        draftRef: { current: unknown };
        pendingAnchorRef: { current: Point | null };
        selectedGuideRef: { current: string | null };
        selectedTabRef: { current: TabMarker | null };
        transformDragRef: { current: unknown };
        onDeleteTab: (entryId: string, tabIndex: number) => void;
        onCancelGuide: () => void;
        onDeleteGuide: (id: string) => void;
        onGuideDraftChange: (
            draft: import('../../lib/guides').GuideDraft | null,
        ) => void;
        onTransformCommit: (commit: TransformCommit | null) => void;
        onCommitLoop: (points: Point[], meta?: LoopMeta) => void;
        forceTick: () => void;
    },
) {
    const {
        viewRef,
        clicksRef,
        cursorRef,
        draftRef,
        pendingAnchorRef,
        selectedGuideRef,
        selectedTabRef,
        transformDragRef,
        onDeleteTab,
        onCancelGuide,
        onDeleteGuide,
        onGuideDraftChange,
        onTransformCommit,
        onCommitLoop,
        forceTick,
    } = deps;
    if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedTabRef.current
    ) {
        const marker = selectedTabRef.current;
        selectedTabRef.current = null;
        onDeleteTab(marker.entryId, marker.tabIndex);
        event.preventDefault();
        forceTick();
        return;
    }
    if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedGuideRef.current
    ) {
        const guideId = selectedGuideRef.current;
        selectedGuideRef.current = null;
        onDeleteGuide(guideId);
        event.preventDefault();
        forceTick();
        return;
    }
    if (event.key === 'Escape') {
        if (viewRef.current.guidePlacement) {
            onCancelGuide();
            onGuideDraftChange(null);
        }
        clicksRef.current = [];
        cursorRef.current = null;
        pendingAnchorRef.current = null;
        selectedGuideRef.current = null;
        draftRef.current = null;
        if (transformDragRef.current || viewRef.current.transformMode) {
            transformDragRef.current = null;
            onTransformCommit(null);
        }
        forceTick();
        return;
    }
    if (viewRef.current.drawTool !== 'polyline' || event.key !== 'Enter')
        return;
    const chain = clicksRef.current;
    if (chain.length >= 2) onCommitLoop([...chain]);
    clicksRef.current = [];
    cursorRef.current = null;
    forceTick();
}

export function completePolylineOnDoubleClick(deps: {
    drawTool: string | null;
    clicksRef: { current: Point[] };
    cursorRef: { current: Point | null };
    onCommitLoop: (points: Point[], meta?: LoopMeta) => void;
    forceTick: () => void;
}) {
    const { drawTool, clicksRef, cursorRef, onCommitLoop, forceTick } = deps;
    if (drawTool !== 'polyline') return;
    const chain = clicksRef.current;
    const trimmed =
        chain.length >= 2 &&
        Math.hypot(
            chain[chain.length - 1].x - chain[chain.length - 2].x,
            chain[chain.length - 1].y - chain[chain.length - 2].y,
        ) < 1
            ? chain.slice(0, -1)
            : chain;
    if (trimmed.length >= 2) onCommitLoop([...trimmed]);
    clicksRef.current = [];
    cursorRef.current = null;
    forceTick();
}
