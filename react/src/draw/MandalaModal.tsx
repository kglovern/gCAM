import { useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { mandalaLoops } from './mandala';
export function MandalaModal({
    units,
    onClose,
    onAdd,
}: {
    units: UnitSystem;
    onClose(): void;
    onAdd(loops: ReturnType<typeof mandalaLoops>): void;
}) {
    const panel = useRef<HTMLFormElement>(null);
    useDialogFocus(panel, true);
    const [diameter, setDiameter] = useState(150),
        [petals, setPetals] = useState('12'),
        [rings, setRings] = useState('3');
    let error = '',
        loops: ReturnType<typeof mandalaLoops> = [];
    try {
        loops = mandalaLoops({
            diameter,
            petals: Number(petals),
            rings: Number(rings),
        });
    } catch (cause) {
        error = (cause as Error).message;
    }
    const field =
        'rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter';
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/50 p-4"
            onMouseDown={onClose}
        >
            <form
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label="Mandala"
                className="grid w-full max-w-sm gap-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-900 shadow-xl dark:border-robin-900 dark:bg-dark dark:text-white"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        onClose();
                    }
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!error) onAdd(loops);
                }}
            >
                <div className="text-base font-semibold">Mandala</div>
                <svg
                    viewBox={`${-diameter / 2 - 2} ${-diameter / 2 - 2} ${diameter + 4} ${diameter + 4}`}
                    className="h-56 w-full rounded bg-white text-slate-800"
                    aria-label="Mandala preview"
                >
                    {loops.map((loop, i) => (
                        <polyline
                            key={i}
                            points={loop.points
                                .map((p) => `${p.x},${p.y}`)
                                .join(' ')}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="0.8"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </svg>
                <label className="grid gap-1">
                    Diameter ({lengthUnit(units)})
                    <UnitInput
                        autoFocus
                        units={units}
                        minMm={5}
                        maxMm={2000}
                        valueMm={diameter}
                        onChangeMm={setDiameter}
                        className={field}
                    />
                </label>
                <label className="grid gap-1">
                    Petals per ring
                    <input
                        type="number"
                        min={4}
                        max={32}
                        step={1}
                        value={petals}
                        onChange={(e) => setPetals(e.target.value)}
                        className={field}
                    />
                </label>
                <label className="grid gap-1">
                    Rings
                    <input
                        type="number"
                        min={1}
                        max={6}
                        step={1}
                        value={rings}
                        onChange={(e) => setRings(e.target.value)}
                        className={field}
                    />
                </label>
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
                        disabled={!!error}
                        className="rounded bg-green-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                    >
                        Add Mandala
                    </button>
                </div>
            </form>
        </div>
    );
}
