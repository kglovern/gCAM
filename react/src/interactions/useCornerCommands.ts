import {
    intersectionConnector,
    type CornerIntersection,
} from '../lib/cornerIntersections';
/**
 * Purpose: React hook that owns the CornerCommands workflow.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { chamferCorner, dogboneCorner, filletCorner } from '../lib/corners';
import type { TransformMode } from '../lib/transform';

interface Point {
    x: number;
    y: number;
}

interface CornerLoop {
    id: string;
    points: Point[];
}

interface UseCornerCommandsOptions<TLoop extends CornerLoop, TStack> {
    loops: TLoop[];
    cornerRadius: number;
    setCornerRadius: Dispatch<SetStateAction<number>>;
    cornerTool: 'fillet' | 'chamfer' | 'dogbone' | null;
    selectedLoops(): TLoop[];
    withIds(items: { points: Point[] }[]): TLoop[];
    formatLength(value: number): string;
    replaceSelection(items: { points: Point[] }[], note: string): void;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setCornerTool: Dispatch<
        SetStateAction<'fillet' | 'chamfer' | 'dogbone' | null>
    >;
    setTransformMode: Dispatch<SetStateAction<TransformMode | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Corner editing commands kept separate from canvas and inspector UI. */
export function useCornerCommands<TLoop extends CornerLoop, TStack>(
    options: UseCornerCommandsOptions<TLoop, TStack>,
) {
    const [pendingCorner, setPendingCorner] = useState<{
        loopId: string;
        index: number;
        tool: 'fillet' | 'chamfer';
        intersection?: CornerIntersection;
    } | null>(null);
    const handleFillet = () => {
        if (!(options.cornerRadius > 0)) return;
        options.setCornerTool('fillet');
        options.setTransformMode(null);
        options.setStatus('Fillet: click a corner, then enter its radius.');
    };

    const handleDogbone = () => {
        options.setCornerTool('dogbone');
        options.setTransformMode(null);
        options.setStatus(
            `Dogbone r=${options.formatLength(options.cornerRadius)}: hover a corner, then click to apply.`,
        );
    };

    const applyCorner = (
        loopId: string,
        cornerIndex: number,
        size: number,
        tool = options.cornerTool,
    ) => {
        if (!(size > 0)) return;
        const target = options.loops.find((loop) => loop.id === loopId);
        if (!target) return;
        const points =
            tool === 'dogbone'
                ? dogboneCorner(target.points, cornerIndex, size)
                : tool === 'chamfer'
                  ? chamferCorner(target.points, cornerIndex, size)
                  : filletCorner(target.points, cornerIndex, size);
        if (!points) {
            options.setStatus('That corner cannot fit the selected size.');
            return false;
        }
        options.pushHistory();
        if (tool === 'dogbone') {
            const added = options.withIds([{ points }]);
            options.setLoops((current) => {
                const next = [...current, ...added];
                options.setStack([]);
                options.refreshBounds(next);
                return next;
            });
            options.setSelected(added.map((loop) => loop.id));
            options.setStatus(`Dogbone r=${options.formatLength(size)} added.`);
        } else {
            options.setStack([]);
            options.setLoops((current) => {
                const next = current.map((loop) =>
                    loop.id === loopId
                        ? {
                              ...loop,
                              points,
                              sourceType: undefined,
                              radius: undefined,
                              sides: undefined,
                              exportGeometry: undefined,
                          }
                        : loop,
                );
                options.refreshBounds(next);
                return next;
            });
            options.setSelected([loopId]);
            options.setStatus(
                `${tool === 'chamfer' ? 'Chamfer' : 'Fillet'} ${options.formatLength(size)} applied.`,
            );
        }
        options.setCornerTool(null);
        return true;
    };

    const handleChamfer = () => {
        options.setCornerTool('chamfer');
        options.setTransformMode(null);
        options.setStatus('Chamfer: click a corner, then enter its size.');
    };
    const handleCorner = (
        loopId: string,
        index: number,
        intersection?: CornerIntersection,
    ) => {
        if (options.cornerTool === 'dogbone')
            applyCorner(loopId, index, options.cornerRadius);
        else if (options.cornerTool)
            setPendingCorner({
                loopId,
                index,
                tool: options.cornerTool,
                intersection,
            });
    };
    const confirmCorner = (size: number) => {
        if (!pendingCorner) return false;
        if (pendingCorner.intersection) {
            const target = pendingCorner.intersection;
            if (
                !target.loopIds.every((id) =>
                    options.loops.some((loop) => loop.id === id),
                )
            )
                return false;
            const points = intersectionConnector(
                target,
                size,
                pendingCorner.tool,
            );
            if (!points) return false;
            const added = options.withIds([{ points }]);
            options.pushHistory();
            const next = [...options.loops, ...added];
            options.setLoops(next);
            options.refreshBounds(next);
            options.setStack([]);
            options.setSelected(added.map((loop) => loop.id));
            options.setCornerRadius(size);
            options.setCornerTool(null);
            options.setStatus(
                `${pendingCorner.tool === 'fillet' ? 'Fillet' : 'Chamfer'} added; original shapes kept.`,
            );
            setPendingCorner(null);
            return true;
        }
        if (
            applyCorner(
                pendingCorner.loopId,
                pendingCorner.index,
                size,
                pendingCorner.tool,
            )
        ) {
            options.setCornerRadius(size);
            setPendingCorner(null);
            return true;
        }
        return false;
    };
    const cancelCorner = () => setPendingCorner(null);
    return {
        handleFillet,
        handleDogbone,
        handleCorner,
        handleChamfer,
        pendingCorner,
        confirmCorner,
        cancelCorner,
    };
}
