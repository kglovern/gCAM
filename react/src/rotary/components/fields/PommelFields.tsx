import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import { formatLength, lengthUnit, type UnitSystem } from '../../../lib/units';
import { hint } from './FieldLayout';
import { rotaryInput as num } from './OpsFields';
import { useState } from 'react';
import type { PommelZone } from '../../engine/types';
export function PommelFields({
    units,
    pommels,
    onAdd,
    onRemove,
}: {
    units: UnitSystem;
    pommels: PommelZone[];
    onAdd: (x0: number, x1: number, w: number) => void;
    onRemove: (i: number) => void;
}): ReactElement {
    const [x0, setX0] = useState(20);
    const [x1, setX1] = useState(35);
    const [w, setW] = useState(30);
    return (
        <section
            className="rotary-operation-fields border-t border-slate-200 pt-3 dark:border-robin-900"
            aria-label="Pommels"
        >
            <div className="text-xs text-slate-500 dark:text-slate-400">
                Square sections / pommels
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    X0
                    <UnitInput
                        units={units}
                        valueMm={x0}
                        stepMm={1}
                        onChangeMm={setX0}
                        className={`${num} !mt-0 !w-16`}
                        aria-label="Pommel start"
                    />
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    X1
                    <UnitInput
                        units={units}
                        valueMm={x1}
                        stepMm={1}
                        onChangeMm={setX1}
                        className={`${num} !mt-0 !w-16`}
                        aria-label="Pommel end"
                    />
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    □
                    <UnitInput
                        units={units}
                        valueMm={w}
                        stepMm={0.5}
                        onChangeMm={setW}
                        className={`${num} !mt-0 !w-16`}
                        aria-label="Pommel flat-to-flat width"
                        title="Flat-to-flat width of the square"
                    />
                    {lengthUnit(units)}
                </label>
                <button
                    type="button"
                    onClick={() => onAdd(x0, x1, w)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-robin-900 dark:hover:bg-dark-lighter"
                >
                    Add
                </button>
            </div>
            <ul className="mt-1.5 space-y-1 text-xs">
                {pommels.map((pm, i) => (
                    <li key={i} className="flex items-center gap-2">
                        <span>
                            X {formatLength(pm.x0, units)}–
                            {formatLength(pm.x1, units)} · □
                            {formatLength(pm.w, units)}
                        </span>
                        <button
                            type="button"
                            title="Remove pommel"
                            aria-label={`Remove pommel ${i + 1}`}
                            onClick={() => onRemove(i)}
                            className="min-h-8 min-w-8 rounded border border-slate-300 px-1.5 dark:border-robin-900"
                        >
                            ✕
                        </button>
                    </li>
                ))}
            </ul>
            <p className={hint}>
                Square blanks stay untouched in these ranges: rough + finish
                skip them. Needs stock Ø ≥ W·√2 so the corners exist. Groove /
                part-off inside a pommel is an interrupted cut — flagged in
                Checks.
            </p>
        </section>
    );
}
