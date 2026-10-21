/**
 * Purpose: React hook that owns the SelectionCommands workflow.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createDocumentId } from '../lib/ids';
import {
    groupIdsForSelection,
    groupLoopIds,
    ungroupLoopIds,
} from '../lib/groups';

interface Point {
    x: number;
    y: number;
}

interface SelectableLoop {
    id: string;
    points: Point[];
    groupId?: string;
}

interface ConfirmRequest {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
}

interface UseSelectionCommandsOptions<TLoop extends SelectableLoop, TStack> {
    loops: TLoop[];
    selected: string[];
    expandedSelectedIds(): string[];
    confirm(request: ConfirmRequest): Promise<boolean>;
    pushHistory(): void;
    onEmpty?(): void;
    refreshBounds(loops: TLoop[]): void;
    moveAfterCloneRef: MutableRefObject<boolean>;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setHidden: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Selection, grouping, deletion and duplication document commands. */
export function useSelectionCommands<TLoop extends SelectableLoop, TStack>(
    options: UseSelectionCommandsOptions<TLoop, TStack>,
) {
    const handleDeleteLoop = async (id: string) => {
        const target = options.loops.find((loop) => loop.id === id);
        const confirmed = await options.confirm({
            title: 'Delete vector?',
            message: `Delete ${target?.id ?? 'this vector'}? You can undo this with Ctrl+Z.`,
            confirmLabel: 'Delete vector',
            destructive: true,
        });
        if (!confirmed) return;
        options.pushHistory();
        options.setLoops((current) => {
            const next = current.filter((loop) => loop.id !== id);
            options.setSelected((selected) =>
                selected.filter((selectedId) => selectedId !== id),
            );
            options.setHidden((hidden) =>
                hidden.filter((hiddenId) => hiddenId !== id),
            );
            options.setStack([]);
            options.refreshBounds(next);
            if (!next.length) options.onEmpty?.();
            return next;
        });
        options.setStatus('Vector deleted.');
    };

    const handleDeleteSelected = async (ids = options.selected) => {
        if (!ids.length) return;
        const confirmed = await options.confirm({
            title: 'Delete selected vectors?',
            message: `Delete ${ids.length} selected vector${ids.length === 1 ? '' : 's'}? You can undo this with Ctrl+Z.`,
            confirmLabel: 'Delete selection',
            destructive: true,
        });
        if (!confirmed) return;
        options.pushHistory();
        const removed = new Set(ids);
        const next = options.loops.filter((loop) => !removed.has(loop.id));
        options.setLoops(next);
        options.setSelected([]);
        options.setHidden((hidden) => hidden.filter((id) => !removed.has(id)));
        options.setStack([]);
        options.setDraftPreview([]);
        options.refreshBounds(next);
        if (!next.length) options.onEmpty?.();
        options.setStatus('Selection deleted.');
    };

    const handleDuplicateSelected = () => {
        if (!options.selected.length) return;
        options.pushHistory();
        const byId = new Map(options.loops.map((loop) => [loop.id, loop]));
        const copies = options.expandedSelectedIds().flatMap((id) => {
            const source = byId.get(id);
            return source
                ? [
                      {
                          ...source,
                          id: createDocumentId('loop'),
                          points: source.points.map((point) => ({
                              x: point.x + 10,
                              y: point.y + 10,
                          })),
                      },
                  ]
                : [];
        });
        if (!copies.length) return;
        options.moveAfterCloneRef.current = true;
        const next = [...options.loops, ...copies];
        options.setLoops(next);
        options.setSelected(copies.map((loop) => loop.id));
        options.setStack([]);
        options.setDraftPreview([]);
        options.refreshBounds(next);
        options.setStatus(`Duplicated ${copies.length} vector(s).`);
    };

    const handleGroup = () => {
        const ids = Array.from(new Set(options.selected));
        if (ids.length < 2) {
            options.setStatus('Select at least two vectors to group.');
            return;
        }
        if (
            ids.some(
                (id) => options.loops.find((loop) => loop.id === id)?.groupId,
            )
        ) {
            options.setStatus(
                'Explode the existing group before creating a new one.',
            );
            return;
        }
        options.pushHistory();
        const groupId = createDocumentId('group');
        options.setLoops((current) => groupLoopIds(current, ids, groupId));
        options.setStatus(`Grouped ${ids.length} vectors.`);
    };

    const handleUngroup = () => {
        const ids = groupIdsForSelection(options.loops, options.selected);
        if (!ids.length) {
            options.setStatus('Select a grouped vector to ungroup.');
            return;
        }
        options.pushHistory();
        options.setLoops((current) => ungroupLoopIds(current, ids));
        options.setStatus(
            `Ungrouped ${ids.length} group${ids.length === 1 ? '' : 's'}.`,
        );
    };

    const canGroup =
        options.selected.length >= 2 &&
        options.selected.every(
            (id) => !options.loops.find((loop) => loop.id === id)?.groupId,
        );
    const canUngroup = options.selected.some((id) =>
        Boolean(options.loops.find((loop) => loop.id === id)?.groupId),
    );

    return {
        handleDeleteLoop,
        handleDeleteSelected,
        handleDuplicateSelected,
        handleGroup,
        handleUngroup,
        canGroup,
        canUngroup,
    };
}
