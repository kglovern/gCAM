import { operationsTouchingShapes } from '../lib/vector-bitmap-document';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from './floating/FloatingPanel';
import { UnitInput } from './UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { repairPathsInWorker } from '../engine/cam-worker-client';
import type { PathRepairRequest, PathRepairResult } from '../lib/path-repair';
export function PathRepairPanel({
    shapes,
    initialMode = 'join',
    stack,
    units,
    onClose,
    onApply,
    onPreview,
}: {
    shapes: PathRepairRequest['shapes'];
    initialMode?: PathRepairRequest['mode'];
    stack: ToolpathStackEntry[];
    units: UnitSystem;
    onClose(): void;
    onApply(result: PathRepairResult): void;
    onPreview(points: { x: number; y: number }[][]): void;
}) {
    const [mode, setMode] = useState<PathRepairRequest['mode']>(initialMode),
        [tolerance, setTolerance] = useState(0.05),
        [closure, setClosure] = useState<PathRepairRequest['closure']>('line');
    const [acrossLayers, setAcrossLayers] = useState(false);
    const [result, setResult] = useState<PathRepairResult | null>(null),
        [error, setError] = useState('');
    const title =
        initialMode === 'duplicates'
            ? 'Delete duplicates'
            : initialMode === 'simplify'
              ? 'Simplify paths'
              : 'Repair paths';
    const affected = useMemo(() => {
        const changed = new Set(result?.changedIds);
        return operationsTouchingShapes(
            stack,
            shapes.filter((s) => changed.has(s.id)),
        ).length;
    }, [stack, shapes, result]);
    useEffect(() => {
        let active = true;
        setResult(null);
        setError('');
        const job = repairPathsInWorker({
            shapes,
            mode,
            tolerance,
            closure,
            acrossLayers,
        });
        void job.promise
            .then((r) => {
                if (active) setResult(r);
            })
            .catch((e) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
            job.cancel();
        };
    }, [shapes, mode, tolerance, closure, acrossLayers]);
    useEffect(() => {
        const changed = new Set(
            result?.duplicates ? result.duplicateKeepIds : result?.changedIds,
        );
        onPreview(
            result?.shapes
                .filter((s) => changed.has(s.id))
                .map((s) => s.points) ?? [],
        );
    }, [result, onPreview]);
    useEffect(() => () => onPreview([]), [onPreview]);
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title={title}
                label={title}
                closeLabel={
                    initialMode === 'duplicates'
                        ? 'Close duplicate review'
                        : initialMode === 'simplify'
                          ? 'Close path simplification'
                          : 'Close path repair'
                }
                placement="right"
                onClose={onClose}
                className="pointer-events-auto w-[340px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    {mode !== 'duplicates' && (
                        <>
                            {mode !== 'simplify' && (
                                <label className="block">
                                    Repair
                                    <select
                                        aria-label="Path repair mode"
                                        value={mode}
                                        onChange={(e) =>
                                            setMode(
                                                e.target.value as typeof mode,
                                            )
                                        }
                                        className="mt-1 w-full rounded border bg-transparent p-2"
                                    >
                                        <option value="join">
                                            Join nearby ends
                                        </option>
                                        <option value="close">
                                            Close gaps
                                        </option>
                                    </select>
                                </label>
                            )}
                            <label className="block">
                                {mode === 'simplify'
                                    ? 'Maximum deviation'
                                    : 'Maximum gap'}{' '}
                                ({lengthUnit(units)})
                                <UnitInput
                                    aria-label="Path repair tolerance"
                                    units={units}
                                    valueMm={tolerance}
                                    minMm={0.000001}
                                    maxMm={1000}
                                    stepMm="any"
                                    decimals={4}
                                    onChangeMm={setTolerance}
                                    className="mt-1 w-full rounded border bg-transparent p-2"
                                />
                            </label>
                        </>
                    )}
                    {mode === 'duplicates' && (
                        <>
                            <p>
                                Keeps the first matching outline. Images and
                                grouped shapes are skipped.
                            </p>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={acrossLayers}
                                    onChange={(e) =>
                                        setAcrossLayers(e.target.checked)
                                    }
                                />
                                Compare across layers
                            </label>
                        </>
                    )}
                    {mode === 'simplify' && (
                        <p>
                            Fits paths to fewer straight segments. Preview
                            narrow features before applying.
                        </p>
                    )}
                    {mode === 'close' && (
                        <label className="block">
                            Close with
                            <select
                                aria-label="Path closure method"
                                value={closure}
                                onChange={(e) =>
                                    setClosure(e.target.value as typeof closure)
                                }
                                className="mt-1 w-full rounded border bg-transparent p-2"
                            >
                                <option value="line">Connecting line</option>
                                <option value="move">Move ends together</option>
                            </select>
                        </label>
                    )}
                    {mode === 'join' && (
                        <p>
                            Joins unique endpoint pairs within the same layer
                            and group. Ambiguous junctions stay unchanged.
                        </p>
                    )}
                    <div aria-live="polite">
                        {error ? (
                            <p role="alert">{error}</p>
                        ) : result ? (
                            mode === 'simplify' ? (
                                <>
                                    <p>
                                        {result.pointsBefore} →{' '}
                                        {result.pointsAfter} points
                                    </p>
                                    <p>
                                        {result.changedIds.length} shapes
                                        simplified
                                    </p>
                                </>
                            ) : mode === 'duplicates' ? (
                                <>
                                    <p>
                                        {result.duplicates} duplicate shapes
                                        found
                                    </p>
                                    <p>
                                        {result.scanned} shapes compared ·{' '}
                                        {result.skipped} skipped
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        {result.found} open shapes ·{' '}
                                        {result.joined} joins · {result.closed}{' '}
                                        closed
                                    </p>
                                    <p>
                                        {result.remaining} open shapes remain
                                        {result.ambiguous
                                            ? ` · ${result.ambiguous} ambiguous endpoints`
                                            : ''}
                                    </p>
                                </>
                            )
                        ) : (
                            'Checking paths…'
                        )}
                    </div>
                    {affected > 0 && (
                        <p className="text-amber-700 dark:text-amber-300">
                            {affected} related toolpaths will be removed.
                            Regenerate them after editing.
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="rounded border px-3 py-2"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                            disabled={!result?.changedIds.length}
                            onClick={() => {
                                if (result) {
                                    try {
                                        onApply(result);
                                    } catch (e) {
                                        setError(
                                            e instanceof Error
                                                ? e.message
                                                : String(e),
                                        );
                                        setResult(null);
                                    }
                                }
                            }}
                        >
                            {mode === 'duplicates'
                                ? 'Delete duplicates'
                                : mode === 'simplify'
                                  ? 'Apply simplification'
                                  : 'Apply repair'}
                        </button>
                    </div>
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
