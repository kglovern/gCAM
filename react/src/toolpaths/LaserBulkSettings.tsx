import { useEffect, useRef, useState } from 'react';
import { UnitInput } from '../components/UnitInput';
import { feedUnit, type UnitSystem } from '../lib/units';
import { imageDataOf } from '../lib/bitmap';
import type { ToolpathStackEntry } from './useToolpathStack';
import {
    rebuildLaserOperations,
    type LaserBulkPatch,
} from './rebuild-laser-operations';

export interface LaserBulkBitmap {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    img?: HTMLImageElement;
}

export function LaserBulkSettings({
    stack,
    entries,
    bitmaps,
    units,
    maxFeed,
    busy,
    onBusy,
    onCommit,
}: {
    stack: ToolpathStackEntry[];
    entries: ToolpathStackEntry[];
    bitmaps: LaserBulkBitmap[];
    units: UnitSystem;
    maxFeed?: number;
    busy: boolean;
    onBusy: (busy: boolean) => void;
    onCommit: (
        before: ToolpathStackEntry[],
        replacements: ToolpathStackEntry[],
    ) => void;
}) {
    const [applyFeed, setApplyFeed] = useState(false),
        [feed, setFeed] = useState(1500);
    const [applyPower, setApplyPower] = useState(false),
        [power, setPower] = useState(40);
    const [applyPasses, setApplyPasses] = useState(false),
        [passes, setPasses] = useState(1);
    const [progress, setProgress] = useState(''),
        [error, setError] = useState('');
    const controller = useRef<AbortController | null>(null);
    const latest = useRef({ stack, bitmaps });
    latest.current = { stack, bitmaps };
    useEffect(
        () => () => {
            controller.current?.abort();
            onBusy(false);
        },
        [stack, bitmaps, onBusy],
    );
    const apply = async () => {
        if (controller.current) return;
        const before = entries;
        const originalBitmaps = bitmaps;
        const abort = new AbortController();
        controller.current = abort;
        onBusy(true);
        setError('');
        setProgress('Preparing selected operations');
        const patch: LaserBulkPatch = {
            ...(applyFeed ? { feed } : {}),
            ...(applyPower ? { power: power * 10 } : {}),
            ...(applyPasses ? { passes } : {}),
        };
        try {
            const results = await rebuildLaserOperations(before, patch, {
                signal: abort.signal,
                maxFeed,
                onProgress: (percent, label) =>
                    setProgress(`${Math.round(percent)}% · ${label}`),
                resolveBitmap: (entry) => {
                    const id = (
                        entry.args.loops.find(
                            (loop) => (loop as { bitmapId?: string }).bitmapId,
                        ) as { bitmapId?: string } | undefined
                    )?.bitmapId;
                    const bitmap = bitmaps.find((bitmap) => bitmap.id === id);
                    if (!bitmap?.img?.naturalWidth)
                        throw new Error(
                            `${entry.label}: source image is not available.`,
                        );
                    return {
                        imageData: imageDataOf(bitmap.img),
                        rotation: bitmap.rotation,
                        bounds: {
                            minX: bitmap.x,
                            minY: bitmap.y,
                            maxX: bitmap.x + bitmap.w,
                            maxY: bitmap.y + bitmap.h,
                        },
                    };
                },
            });
            if (abort.signal.aborted)
                throw new DOMException('Bulk changes cancelled.', 'AbortError');
            if (
                latest.current.bitmaps !== originalBitmaps ||
                before.some(
                    (entry) =>
                        latest.current.stack.find((e) => e.id === entry.id) !==
                        entry,
                )
            )
                throw new Error(
                    'The job changed. Apply again to the current operations.',
                );
            if (results.length) onCommit(before, results);
            setProgress(
                results.length
                    ? `${results.length} operation${results.length === 1 ? '' : 's'} updated.`
                    : 'No settings changed.',
            );
        } catch (e) {
            setProgress('');
            setError(
                e instanceof DOMException && e.name === 'AbortError'
                    ? 'Bulk rebuild cancelled.'
                    : e instanceof Error
                      ? e.message
                      : String(e),
            );
        } finally {
            if (controller.current === abort) {
                controller.current = null;
                onBusy(false);
            }
        }
    };
    const input =
        'w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-robin-900 dark:bg-dark';
    return (
        <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Edit selected settings</summary>
            <fieldset
                disabled={busy}
                className="mt-2 grid grid-cols-2 items-center gap-2"
            >
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        aria-label="Apply selected speed"
                        checked={applyFeed}
                        onChange={(e) => setApplyFeed(e.target.checked)}
                    />
                    Speed ({feedUnit(units)})
                </label>
                <UnitInput
                    aria-label="Selected laser speed"
                    units={units}
                    valueMm={feed}
                    onChangeMm={setFeed}
                    disabled={!applyFeed}
                    minMm={1}
                    stepMm={100}
                    className={input}
                />
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        aria-label="Apply selected power"
                        checked={applyPower}
                        onChange={(e) => setApplyPower(e.target.checked)}
                    />
                    Power (%)
                </label>
                <input
                    type="number"
                    aria-label="Selected laser power"
                    value={power}
                    onChange={(e) => setPower(Number(e.target.value))}
                    disabled={!applyPower}
                    min={0}
                    max={100}
                    className={input}
                />
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        aria-label="Apply selected passes"
                        checked={applyPasses}
                        onChange={(e) => setApplyPasses(e.target.checked)}
                    />
                    Passes
                </label>
                <input
                    type="number"
                    aria-label="Selected laser passes"
                    value={passes}
                    onChange={(e) => setPasses(Number(e.target.value))}
                    disabled={!applyPasses}
                    min={1}
                    max={100}
                    className={input}
                />
                <button
                    type="button"
                    className="col-span-2 rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-robin-900"
                    disabled={
                        !entries.length ||
                        (!applyFeed && !applyPower && !applyPasses)
                    }
                    onClick={apply}
                >
                    Apply to selected
                </button>
            </fieldset>
            {busy && (
                <button
                    type="button"
                    className="mt-2 underline"
                    onClick={() => controller.current?.abort()}
                >
                    Cancel bulk rebuild
                </button>
            )}
            {progress && (
                <p role="status" className="mt-1">
                    {progress}
                </p>
            )}
            {error && (
                <p role="alert" className="mt-1 text-red-600">
                    {error}
                </p>
            )}
        </details>
    );
}
