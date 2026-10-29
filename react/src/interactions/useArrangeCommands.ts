/**
 * Purpose: React hook that owns the ArrangeCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import {
    applyBoolean,
    offsetLoops,
    type BooleanOperation,
} from '../lib/engine';
import { buildNestUnits, nestPlacements } from '../lib/nest';

interface Point {
    x: number;
    y: number;
}

interface ArrangeLoop {
    id: string;
    points: Point[];
    groupId?: string;
}

interface UseArrangeCommandsOptions<TLoop extends ArrangeLoop, TStack> {
    loops: TLoop[];
    selected: string[];
    offsetAmount: number;
    sheetW: number;
    sheetH: number;
    nestBorder: number;
    nestSpacing: number;
    selectedLoops(): TLoop[];
    expandedSelectedIds(): string[];
    withIds(items: { points: Point[] }[]): TLoop[];
    formatLength(value: number): string;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    setOffsetPreview: Dispatch<SetStateAction<Point[][]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Boolean, offset and nesting commands kept outside the app shell. */
export function useArrangeCommands<TLoop extends ArrangeLoop, TStack>(
    options: UseArrangeCommandsOptions<TLoop, TStack>,
) {
    const replaceSelection = (items: { points: Point[] }[], note: string) => {
        options.pushHistory();
        const results = options.withIds(items);
        const removed = new Set(options.expandedSelectedIds());
        const next = [
            ...options.loops.filter((loop) => !removed.has(loop.id)),
            ...results,
        ];
        options.setLoops(next);
        options.setSelected(results.map((loop) => loop.id));
        options.setStack([]);
        options.setDraftPreview([]);
        options.setOffsetPreview([]);
        options.refreshBounds(next);
        options.setStatus(note);
    };

    const handleNest = () => {
        const targets =
            options.selected.length > 0
                ? options.selectedLoops()
                : options.loops;
        if (!targets.length) return;
        const units = buildNestUnits(targets);
        const { placements, failedIndex } = nestPlacements(
            units,
            options.sheetW,
            options.sheetH,
            options.nestBorder,
            options.nestSpacing,
        );
        if (failedIndex != null) {
            options.setStatus(
                `Part ${failedIndex + 1} does not fit on this sheet.`,
            );
            return;
        }
        const nested = units.flatMap((unit, index) =>
            unit.loops.map(
                (loop) =>
                    ({
                        ...loop,
                        id: options.withIds([{ points: loop.points }])[0].id,
                        ...(unit.groupId ? { groupId: unit.groupId } : {}),
                        points: loop.points.map((point) => ({
                            x: point.x - unit.minX + placements[index].dx,
                            y: point.y - unit.minY + placements[index].dy,
                        })),
                    }) as TLoop,
            ),
        );
        options.pushHistory();
        const next =
            options.selected.length > 0
                ? [
                      ...options.loops.filter(
                          (loop) =>
                              !new Set(options.expandedSelectedIds()).has(
                                  loop.id,
                              ),
                      ),
                      ...nested,
                  ]
                : nested;
        options.setLoops(next);
        options.setSelected(nested.map((loop) => loop.id));
        options.setStack([]);
        options.refreshBounds(next);
        options.setStatus(
            `Nested ${units.length} part${units.length === 1 ? '' : 's'} on ${options.formatLength(options.sheetW)} × ${options.formatLength(options.sheetH)}.`,
        );
    };

    const handleBoolean = (operation: BooleanOperation) => {
        if (options.selected.length < 2) return;
        try {
            const inputs = options.selectedLoops();
            const results = applyBoolean(inputs, operation);
            replaceSelection(
                results,
                `${operation}: ${inputs.length} shapes → ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : 'Could not combine or subtract the shapes',
            );
        }
    };

    const handleOffset = () => {
        const targets =
            options.selected.length > 0
                ? options.selectedLoops()
                : options.loops;
        if (!targets.length) return;
        try {
            const results = offsetLoops(targets, options.offsetAmount);
            options.pushHistory();
            const added = options.withIds(results);
            const next = [...options.loops, ...added];
            options.setLoops(next);
            options.setSelected(added.map((loop) => loop.id));
            options.setStack([]);
            options.setDraftPreview([]);
            options.setOffsetPreview([]);
            options.refreshBounds(next);
            options.setStatus(
                `Offset ${options.formatLength(options.offsetAmount)} added ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Offset failed',
            );
        }
    };

    return { handleNest, handleBoolean, handleOffset, replaceSelection };
}
