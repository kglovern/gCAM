/**
 * Purpose: React hook that owns the DrawCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { DrawTool } from './geometry';
import { snapToGuides, type Guide } from '../lib/guides';
import { outlineTextLoops, textLoops } from './textGeometry';

interface Point {
    x: number;
    y: number;
}

interface DrawLoop {
    id: string;
    points: Point[];
}

interface UseDrawCommandsOptions<TLoop extends DrawLoop, TStack> {
    drawTool: DrawTool;
    guides: Guide[];
    drawText: string;
    drawFont: string;
    drawTextHeight: number;
    newLoopId(): string;
    withIds(items: { points: Point[] }[]): TLoop[];
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Canvas drawing and text placement document commands. */
export function useDrawCommands<TLoop extends DrawLoop, TStack>(
    options: UseDrawCommandsOptions<TLoop, TStack>,
) {
    const handleCommitLoop = (points: Point[], meta?: object) => {
        options.pushHistory();
        const snapped = points.map((point) =>
            snapToGuides(point, options.guides),
        );
        const loop = {
            ...options.withIds([{ points: snapped }])[0],
            ...meta,
        } as TLoop;
        options.setLoops((current) => {
            const next = [...current, loop];
            options.setSelected([loop.id]);
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus(
            `Drew ${options.drawTool} (${points.length} points).`,
        );
    };

    const handleCommitText = async (
        at: Point,
        textValue = options.drawText,
        fontValue = options.drawFont,
        heightValue = options.drawTextHeight,
    ) => {
        const origin = snapToGuides(at, options.guides);
        const rawPlaced =
            fontValue === 'single-line'
                ? textLoops(textValue, origin, heightValue)
                : await outlineTextLoops(
                      textValue,
                      origin,
                      heightValue,
                      fontValue,
                  );
        const textPoints = rawPlaced.flatMap((loop) => loop.points);
        const textBounds = textPoints.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxX: Math.max(bounds.maxX, point.x),
                maxY: Math.max(bounds.maxY, point.y),
            }),
            {
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity,
            },
        );
        const center = {
            x: (textBounds.minX + textBounds.maxX) / 2,
            y: (textBounds.minY + textBounds.maxY) / 2,
        };
        const placed = rawPlaced.map((loop) => ({
            points: loop.points.map((point) => ({
                x: point.x + origin.x - center.x,
                y: point.y + origin.y - center.y,
            })),
        }));
        if (!placed.length) {
            options.setStatus('Nothing to place — type some text first.');
            return;
        }
        options.pushHistory();
        const stamped = options.withIds(placed).map(
            (loop) =>
                ({
                    ...loop,
                    sourceType: 'text',
                    text: textValue,
                    fontId: fontValue,
                    fontSize: heightValue,
                }) as TLoop,
        );
        options.setLoops((current) => {
            const next = [...current, ...stamped];
            options.setSelected(stamped.map((loop) => loop.id));
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus(
            `Placed "${textValue}" (${placed.length} ${fontValue === 'single-line' ? 'strokes' : 'outlines'}).`,
        );
    };

    return { handleCommitLoop, handleCommitText };
}
