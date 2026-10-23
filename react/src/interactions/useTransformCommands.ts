/**
 * Purpose: React hook that owns the TransformCommands workflow.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    rotatePoints,
    scalePoints,
    scalePointsXY,
    translatePoints,
    type TransformCommit,
    type TransformMode,
} from '../lib/transform';

interface Point {
    x: number;
    y: number;
}

interface TransformLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}

interface TransformBitmap {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
}

export interface SelectionFrame {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
}

interface UseTransformCommandsOptions<
    TLoop extends TransformLoop,
    TStack,
    TBitmap extends TransformBitmap,
> {
    selectionFrame: SelectionFrame | null;
    selectedLoops(): TLoop[];
    moveX: number;
    moveY: number;
    rotateDeg: number;
    sizeW: number;
    sizeH: number;
    aspectLock: boolean;
    orientRef: MutableRefObject<{ key: string; angle: number }>;
    formatLength(value: number): string;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setBitmaps: Dispatch<SetStateAction<TBitmap[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    setTransformMode: Dispatch<SetStateAction<TransformMode | null>>;
    setPreserveViewToken: Dispatch<SetStateAction<number>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setRotateDeg: Dispatch<SetStateAction<number>>;
    setSizeW: Dispatch<SetStateAction<number>>;
    setSizeH: Dispatch<SetStateAction<number>>;
}

/** Canvas and inspector transforms with a single mutation implementation. */
export function useTransformCommands<
    TLoop extends TransformLoop,
    TStack,
    TBitmap extends TransformBitmap,
>(options: UseTransformCommandsOptions<TLoop, TStack, TBitmap>) {
    const applyTransform = (
        transform: (points: Point[]) => Point[],
        note: string,
        transformBitmap?: (bitmap: TBitmap) => TBitmap,
    ) => {
        const targets = options.selectedLoops();
        if (!targets.length) return;
        try {
            const ids = new Set(targets.map((target) => target.id));
            const bitmapIds = new Set(
                targets.flatMap((target) =>
                    target.bitmapId ? [target.bitmapId] : [],
                ),
            );
            options.pushHistory();
            if (bitmapIds.size && transformBitmap) {
                options.setBitmaps((current) =>
                    current.map((bitmap) =>
                        bitmapIds.has(bitmap.id)
                            ? transformBitmap(bitmap)
                            : bitmap,
                    ),
                );
            }
            options.setLoops((current) => {
                const next = current.map((loop) =>
                    ids.has(loop.id)
                        ? { ...loop, points: transform(loop.points) }
                        : loop,
                );
                options.setStack([]);
                options.setDraftPreview([]);
                options.refreshBounds(next);
                return next;
            });
            options.setTransformMode(null);
            options.setStatus(note);
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Transform failed',
            );
        }
    };

    const applyAbsoluteMove = () => {
        const frame = options.selectionFrame;
        if (!frame) return;
        applyTransform(
            (points) =>
                translatePoints(
                    points,
                    options.moveX - frame.cx,
                    options.moveY - frame.cy,
                ),
            `Moved to ${options.formatLength(options.moveX)}, ${options.formatLength(options.moveY)}.`,
            (bitmap) => ({
                ...bitmap,
                x: bitmap.x + options.moveX - frame.cx,
                y: bitmap.y + options.moveY - frame.cy,
            }),
        );
    };

    const applyAbsoluteRotate = () => {
        const frame = options.selectionFrame;
        if (!frame) return;
        const delta = options.rotateDeg - options.orientRef.current.angle;
        applyTransform(
            (points) =>
                rotatePoints(points, delta, { x: frame.cx, y: frame.cy }),
            `Rotated to ${options.rotateDeg}°.`,
            (bitmap) => {
                const center = {
                    x: bitmap.x + bitmap.w / 2,
                    y: bitmap.y + bitmap.h / 2,
                };
                const radians = (delta * Math.PI) / 180;
                const dx = center.x - frame.cx;
                const dy = center.y - frame.cy;
                const rotated = {
                    x:
                        frame.cx +
                        dx * Math.cos(radians) -
                        dy * Math.sin(radians),
                    y:
                        frame.cy +
                        dx * Math.sin(radians) +
                        dy * Math.cos(radians),
                };
                return {
                    ...bitmap,
                    x: rotated.x - bitmap.w / 2,
                    y: rotated.y - bitmap.h / 2,
                    rotation: (bitmap.rotation ?? 0) + delta,
                };
            },
        );
        options.orientRef.current.angle = options.rotateDeg;
    };

    const applyAbsoluteSize = () => {
        const frame = options.selectionFrame;
        if (!frame || !(frame.w > 0) || !(frame.h > 0)) return;
        const widthFactor = options.sizeW / frame.w;
        const heightFactor = options.aspectLock
            ? widthFactor
            : options.sizeH / frame.h;
        if (!(widthFactor > 0) || !(heightFactor > 0)) {
            options.setStatus('Size must be positive.');
            return;
        }
        applyTransform(
            (points) =>
                scalePointsXY(points, widthFactor, heightFactor, {
                    x: frame.cx,
                    y: frame.cy,
                }),
            `Resized to ${options.formatLength(options.sizeW)} × ${options.formatLength(options.sizeH)}.`,
            (bitmap) => {
                const center = {
                    x: bitmap.x + bitmap.w / 2,
                    y: bitmap.y + bitmap.h / 2,
                };
                const w = bitmap.w * widthFactor;
                const h = bitmap.h * heightFactor;
                return {
                    ...bitmap,
                    x: center.x - w / 2,
                    y: center.y - h / 2,
                    w,
                    h,
                };
            },
        );
    };

    const setSizeWLocked = (value: number) => {
        options.setSizeW(value);
        const frame = options.selectionFrame;
        if (options.aspectLock && frame && frame.w > 0) {
            options.setSizeH(
                Math.round(value * (frame.h / frame.w) * 100) / 100,
            );
        }
    };

    const setSizeHLocked = (value: number) => {
        options.setSizeH(value);
        const frame = options.selectionFrame;
        if (options.aspectLock && frame && frame.h > 0) {
            options.setSizeW(
                Math.round(value * (frame.w / frame.h) * 100) / 100,
            );
        }
    };

    const handleTransformCommit = (commit: TransformCommit | null, preserveMode = false) => {
        if (!preserveMode) options.setTransformMode(null);
        if (!commit) return;
        const targets = options.selectedLoops();
        if (!targets.length) return;
        try {
            const ids = new Set(targets.map((target) => target.id));
            const bitmapIds = new Set(
                targets.flatMap((target) =>
                    target.bitmapId ? [target.bitmapId] : [],
                ),
            );
            const transform =
                commit.type === 'move'
                    ? (points: Point[]) =>
                          translatePoints(points, commit.dx, commit.dy)
                    : commit.type === 'rotate'
                      ? (points: Point[]) =>
                            rotatePoints(points, commit.degrees, commit.about)
                      : (points: Point[]) =>
                            scalePoints(points, commit.factor, commit.about);
            if (commit.type === 'rotate') {
                options.orientRef.current.angle += commit.degrees;
                options.setRotateDeg(
                    Math.round(options.orientRef.current.angle * 10) / 10,
                );
            }
            options.pushHistory();
            options.setPreserveViewToken((token) => token + 1);
            if (bitmapIds.size) {
                options.setBitmaps((current) =>
                    current.map((bitmap) => {
                        if (!bitmapIds.has(bitmap.id)) return bitmap;
                        const angle = bitmap.rotation ?? 0;
                        const center = {
                            x: bitmap.x + bitmap.w / 2,
                            y: bitmap.y + bitmap.h / 2,
                        };
                        if (commit.type === 'move') {
                            return {
                                ...bitmap,
                                x: bitmap.x + commit.dx,
                                y: bitmap.y + commit.dy,
                            };
                        }
                        if (commit.type === 'scale') {
                            const scaledCenter = {
                                x:
                                    commit.about.x +
                                    (center.x - commit.about.x) * commit.factor,
                                y:
                                    commit.about.y +
                                    (center.y - commit.about.y) * commit.factor,
                            };
                            const w = bitmap.w * commit.factor;
                            const h = bitmap.h * commit.factor;
                            return {
                                ...bitmap,
                                x: scaledCenter.x - w / 2,
                                y: scaledCenter.y - h / 2,
                                w,
                                h,
                            };
                        }
                        const radians = (commit.degrees * Math.PI) / 180;
                        const dx = center.x - commit.about.x;
                        const dy = center.y - commit.about.y;
                        const rotatedCenter = {
                            x:
                                commit.about.x +
                                dx * Math.cos(radians) -
                                dy * Math.sin(radians),
                            y:
                                commit.about.y +
                                dx * Math.sin(radians) +
                                dy * Math.cos(radians),
                        };
                        return {
                            ...bitmap,
                            x: rotatedCenter.x - bitmap.w / 2,
                            y: rotatedCenter.y - bitmap.h / 2,
                            rotation: angle + commit.degrees,
                        };
                    }),
                );
            }
            options.setLoops((current) => {
                const next = current.map((loop) =>
                    ids.has(loop.id)
                        ? { ...loop, points: transform(loop.points) }
                        : loop,
                );
                options.setStack([]);
                options.setDraftPreview([]);
                options.refreshBounds(next);
                return next;
            });
            options.setStatus(
                commit.type === 'move'
                    ? `Moved ${options.formatLength(commit.dx)}, ${options.formatLength(commit.dy)}.`
                    : commit.type === 'rotate'
                      ? `Rotated ${commit.degrees.toFixed(1)}°.`
                      : `Scaled ×${commit.factor.toFixed(3)}.`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Transform failed',
            );
        }
    };

    return {
        applyAbsoluteMove,
        applyAbsoluteRotate,
        applyAbsoluteSize,
        setSizeWLocked,
        setSizeHLocked,
        handleTransformCommit,
    };
}
