import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { FontPicker } from './FontPicker';
import {
    generateShape,
    GENERATOR_NAMES,
    type GeneratedLoop,
    type GeneratorOptions,
} from './generators';

export function GeneratorModal({
    kind,
    units,
    onClose,
    onAdd,
}: {
    kind: 'clock';
    units: UnitSystem;
    onClose(): void;
    onAdd(loops: GeneratedLoop[]): void;
}) {
    const panel = useRef<HTMLFormElement>(null);
    useDialogFocus(panel, true);
    const [options, setOptions] = useState<GeneratorOptions>({
        x: 0,
        y: 0,
        endX: 50,
        endY: 0,
        width: 100,
        height: 60,
        radius: 10,
        diameter: 300,
        font: 'single-line',
    });
    const [loops, setLoops] = useState<GeneratedLoop[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        setError('');
        generateShape(kind, options)
            .then((next) => {
                if (!cancelled) {
                    setLoops(next);
                    setBusy(false);
                }
            })
            .catch((cause) => {
                if (!cancelled) {
                    setLoops([]);
                    setError(
                        cause instanceof Error ? cause.message : String(cause),
                    );
                    setBusy(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [kind, options]);
    const fields: [Exclude<keyof GeneratorOptions, 'font'>, string][] = [
        ['diameter', 'Diameter'],
    ];
    const points = loops.flatMap((loop) => loop.points);
    const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
    const minX = points.length ? Math.min(...xs) : -50,
        maxX = points.length ? Math.max(...xs) : 50;
    const minY = points.length ? Math.min(...ys) : -50,
        maxY = points.length ? Math.max(...ys) : 50;
    const pad = Math.max(maxX - minX, maxY - minY) * 0.08 || 5;
    const field =
        'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter';
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/50 p-4"
            onMouseDown={onClose}
        >
            <form
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={GENERATOR_NAMES[kind]}
                className="grid max-h-[90dvh] w-full max-w-lg gap-3 overflow-y-auto rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-900 shadow-xl dark:border-robin-900 dark:bg-dark dark:text-white"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        onClose();
                    }
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && !error && loops.length) onAdd(loops);
                }}
            >
                <h2 className="text-base font-semibold">
                    {GENERATOR_NAMES[kind]}
                </h2>
                <svg
                    aria-label={`${GENERATOR_NAMES[kind]} preview`}
                    className="h-52 w-full rounded bg-white text-slate-800"
                    viewBox={`${minX - pad} ${-maxY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
                >
                    <g transform="scale(1,-1)">
                        {loops.map((loop, index) => (
                            <polyline
                                key={index}
                                points={loop.points
                                    .map((p) => `${p.x},${p.y}`)
                                    .join(' ')}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="0.8"
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                    </g>
                </svg>
                <div className="grid grid-cols-2 gap-2">
                    {fields.map(([key, label]) => (
                        <label key={key} className="grid gap-1">
                            {label} ({lengthUnit(units)})
                            <UnitInput
                                units={units}
                                valueMm={options[key]}
                                stepMm="any"
                                required
                                onChangeMm={(value) => {
                                    setBusy(true);
                                    setOptions((current) => ({
                                        ...current,
                                        [key]: value,
                                    }));
                                }}
                                className={field}
                            />
                        </label>
                    ))}
                </div>
                {kind === 'clock' && (
                    <>
                        <div className="grid gap-1">
                            <span>Font</span>
                            <FontPicker
                                value={options.font}
                                onChange={(font) => {
                                    setBusy(true);
                                    setOptions((current) => ({
                                        ...current,
                                        font,
                                    }));
                                }}
                                className={field}
                            />
                        </div>
                        <p className="text-xs text-slate-500">
                            Centred on origin (X0 Y0).
                        </p>
                    </>
                )}
                {error && <p role="alert">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border px-3 py-1.5"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={busy || !!error || !loops.length}
                        className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-50"
                    >
                        Add {GENERATOR_NAMES[kind]}
                    </button>
                </div>
            </form>
        </div>
    );
}
