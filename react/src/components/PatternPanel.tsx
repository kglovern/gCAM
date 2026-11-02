import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ViewLoop } from '../canvas/types';
import { patternArtworkInWorker } from '../engine/cam-worker-client';
import {
    patternBounds,
    type PatternResult,
    type PatternSettings,
} from '../lib/pattern-artwork';
import type { UnitSystem } from '../lib/units';
import { lengthUnit } from '../lib/units';
import { FloatingPanel } from './floating/FloatingPanel';
import { UnitInput } from './UnitInput';

export function PatternPanel({
    shapes,
    initialKind,
    units,
    onClose,
    onPreview,
    onApply,
}: {
    shapes: ViewLoop[];
    initialKind: PatternSettings['kind'];
    units: UnitSystem;
    onClose(): void;
    onPreview(points: ViewLoop['points'][]): void;
    onApply(result: PatternResult): void;
}) {
    const [kind, setKind] = useState(initialKind),
        [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical'),
        [position, setPosition] = useState(() => {
            const b = patternBounds(shapes);
            return (b.minX + b.maxX) / 2;
        }),
        [keepOriginal, setKeepOriginal] = useState(false),
        [columns, setColumns] = useState(2),
        [rows, setRows] = useState(2),
        [gapX, setGapX] = useState(5),
        [gapY, setGapY] = useState(5),
        [count, setCount] = useState(6),
        [centerX, setCenterX] = useState(0),
        [centerY, setCenterY] = useState(0),
        [sweep, setSweep] = useState(360),
        [rotateCopies, setRotateCopies] = useState(true),
        [result, setResult] = useState<PatternResult | null>(null),
        [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setResult(null);
        setError('');
        const settings: PatternSettings =
            kind === 'mirror'
                ? { kind, axis, position, keepOriginal }
                : kind === 'rectangular'
                  ? { kind, columns, rows, gapX, gapY }
                  : { kind, count, centerX, centerY, sweep, rotateCopies };
        const job = patternArtworkInWorker(shapes, settings);
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
    }, [
        shapes,
        kind,
        axis,
        position,
        keepOriginal,
        columns,
        rows,
        gapX,
        gapY,
        count,
        centerX,
        centerY,
        sweep,
        rotateCopies,
    ]);
    useEffect(() => {
        onPreview(
            result?.instances.flatMap((instance) =>
                instance.map((s) => s.points),
            ) ?? [],
        );
    }, [result, onPreview]);
    useEffect(() => () => onPreview([]), [onPreview]);
    const field = 'mt-1 w-full rounded border bg-transparent p-2';
    const length = (
        label: string,
        value: number,
        change: (v: number) => void,
        min?: number,
    ) => (
        <label>
            {label} ({lengthUnit(units)})
            <UnitInput
                aria-label={label}
                units={units}
                valueMm={value}
                onChangeMm={change}
                minMm={min}
                className={field}
            />
        </label>
    );
    const number = (
        label: string,
        value: number,
        change: (v: number) => void,
        min: number,
        max: number,
    ) => (
        <label>
            {label}
            <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step={label.includes('angle') ? 'any' : 1}
                value={Number.isFinite(value) ? value : ''}
                onChange={(e) => {
                    setResult(null);
                    change(
                        e.target.value === '' ? NaN : Number(e.target.value),
                    );
                }}
                className={field}
            />
        </label>
    );
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Mirror / Pattern"
                label="Mirror and pattern"
                placement="right"
                closeLabel="Close Mirror and Pattern"
                onClose={onClose}
                className="pointer-events-auto w-[340px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <label className="block">
                        Tool
                        <select
                            aria-label="Pattern tool"
                            value={kind}
                            className={field}
                            onChange={(e) => {
                                setResult(null);
                                setKind(e.target.value as typeof kind);
                            }}
                        >
                            <option value="mirror">Mirror</option>
                            <option value="rectangular">
                                Rectangular pattern
                            </option>
                            <option value="circular">Circular pattern</option>
                        </select>
                    </label>
                    {kind === 'mirror' ? (
                        <>
                            <label className="block">
                                Direction
                                <select
                                    aria-label="Mirror direction"
                                    className={field}
                                    value={axis}
                                    onChange={(e) => {
                                        const next = e.target
                                                .value as typeof axis,
                                            b = patternBounds(shapes);
                                        setResult(null);
                                        setAxis(next);
                                        setPosition(
                                            next === 'vertical'
                                                ? (b.minX + b.maxX) / 2
                                                : (b.minY + b.maxY) / 2,
                                        );
                                    }}
                                >
                                    <option value="vertical">
                                        Left / right
                                    </option>
                                    <option value="horizontal">
                                        Top / bottom
                                    </option>
                                </select>
                            </label>
                            <div className="grid grid-cols-1">
                                {length(
                                    axis === 'vertical'
                                        ? 'Mirror line X'
                                        : 'Mirror line Y',
                                    position,
                                    (v) => {
                                        setResult(null);
                                        setPosition(v);
                                    },
                                )}
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={keepOriginal}
                                    onChange={(e) => {
                                        setResult(null);
                                        setKeepOriginal(e.target.checked);
                                    }}
                                />
                                Keep original
                            </label>
                        </>
                    ) : kind === 'rectangular' ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                {number(
                                    'Columns',
                                    columns,
                                    setColumns,
                                    1,
                                    1000,
                                )}
                                {number('Rows', rows, setRows, 1, 1000)}
                                {length(
                                    'Horizontal gap',
                                    gapX,
                                    (v) => {
                                        setResult(null);
                                        setGapX(v);
                                    },
                                    0,
                                )}
                                {length(
                                    'Vertical gap',
                                    gapY,
                                    (v) => {
                                        setResult(null);
                                        setGapY(v);
                                    },
                                    0,
                                )}
                            </div>
                            <p>
                                Counts include the original. Gaps are between
                                selection edges.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                {number(
                                    'Total positions',
                                    count,
                                    setCount,
                                    2,
                                    1000,
                                )}
                                {number(
                                    'Sweep angle (°)',
                                    sweep,
                                    setSweep,
                                    -360,
                                    360,
                                )}
                                {length('Centre X', centerX, (v) => {
                                    setResult(null);
                                    setCenterX(v);
                                })}
                                {length('Centre Y', centerY, (v) => {
                                    setResult(null);
                                    setCenterY(v);
                                })}
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={rotateCopies}
                                    onChange={(e) => {
                                        setResult(null);
                                        setRotateCopies(e.target.checked);
                                    }}
                                />
                                Rotate copies
                            </label>
                            <p>
                                Positions include the original. 360° makes a
                                complete ring.
                            </p>
                        </>
                    )}
                    <div aria-live="polite">
                        {error ? (
                            <p role="alert">{error}</p>
                        ) : result ? (
                            `${result.instances.length} ${result.replace ? 'mirrored selection' : 'copies'}`
                        ) : (
                            'Calculating preview…'
                        )}
                    </div>
                    {result?.replace && (
                        <p>Related toolpaths will need regenerating.</p>
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
                            disabled={!result}
                            onClick={() => {
                                if (result)
                                    try {
                                        onApply(result);
                                    } catch (e) {
                                        setError((e as Error).message);
                                        setResult(null);
                                    }
                            }}
                        >
                            Apply {kind === 'mirror' ? 'mirror' : 'pattern'}
                        </button>
                    </div>
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
