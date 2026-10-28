/**
 * Purpose: React hook that owns the TrimCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import { findTrimTarget } from '../lib/trim';

interface Point {
    x: number;
    y: number;
}

interface TrimLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}

interface UseTrimCommandsOptions<TLoop extends TrimLoop, TStack> {
    loops: TLoop[];
    selected: string[];
    hidden: string[];
    newLoopId(): string;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Point and stroke trimming commands for selected vector geometry. */
export function useTrimCommands<TLoop extends TrimLoop, TStack>(
    options: UseTrimCommandsOptions<TLoop, TStack>,
) {
    const replace = (
        loop: TLoop,
        result: NonNullable<ReturnType<typeof findTrimTarget>>,
    ) =>
        [result.before, result.after]
            .filter((shape) => shape.length >= 2)
            .map(
                (shape) =>
                    ({
                        ...loop,
                        id: options.newLoopId(),
                        points: shape,
                        sourceType: undefined,
                        exportGeometry: undefined,
                        radius: undefined,
                        sides: undefined,
                        polygonMode: undefined,
                        text: undefined,
                        fontId: undefined,
                        fontSize: undefined,
                    }) as TLoop,
            );

    const handleTrimAt = (point: Point) => {
        const hit = findTrimTarget(
            options.loops,
            point,
            8,
            options.selected,
            options.hidden,
        );
        if (!hit) {
            options.setStatus('Click a vector section to trim it.');
            return;
        }
        options.pushHistory();
        options.setLoops((current) => {
            const next = current.flatMap((loop) => {
                if (loop.id !== hit.loopId) return [loop];
                return replace(loop, hit);
            });
            options.setSelected(
                options.selected.filter((id) => id !== hit.loopId),
            );
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus('Trimmed vector section.');
    };

    const handleTrimStroke = (points: Point[]) => {
        const hits = new Map<
            string,
            NonNullable<ReturnType<typeof findTrimTarget>>
        >();
        for (const point of points) {
            const targets = options.loops
                .filter(
                    (loop) =>
                        !hits.has(loop.id) &&
                        !loop.bitmapId &&
                        !options.hidden.includes(loop.id) &&
                        (!options.selected.length ||
                            options.selected.includes(loop.id)),
                )
                .map((loop) => loop.id);
            if (!targets.length) break;
            const hit = findTrimTarget(
                options.loops,
                point,
                8,
                targets,
                options.hidden,
            );
            if (hit) hits.set(hit.loopId, hit);
        }
        if (!hits.size) {
            options.setStatus(
                'Hold Ctrl and drag across vector segments to trim them.',
            );
            return;
        }
        options.pushHistory();
        options.setLoops((current) => {
            const next = current.flatMap((loop) => {
                const result = hits.get(loop.id);
                if (!result) return [loop];
                return replace(loop, result);
            });
            options.setSelected([]);
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus(
            `Trimmed ${hits.size} vector segment${hits.size === 1 ? '' : 's'}.`,
        );
    };

    return { handleTrimAt, handleTrimStroke };
}
