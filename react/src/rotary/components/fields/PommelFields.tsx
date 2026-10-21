import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import {
    formatLength,
    lengthUnit,
    feedUnit,
    type UnitSystem,
} from '../../../lib/units';
import { panel, h2, hint, num, check, Row, Label } from './FieldLayout';
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
        <section className={panel} aria-label="Pommels">
            <h2 className={h2}>
                Pommels{' '}
                <small className="font-normal text-slate-500 dark:text-slate-400">
                    square sections · keep-out
                </small>
            </h2>
            <Row>
                <Label>
                    X0
                    <UnitInput
                        units={units}
                        valueMm={x0}
                        stepMm={1}
                        onChangeMm={setX0}
                        className={`${num} w-16`}
                        aria-label="Pommel start"
                    />
                </Label>
                <Label>
                    X1
                    <UnitInput
                        units={units}
                        valueMm={x1}
                        stepMm={1}
                        onChangeMm={setX1}
                        className={`${num} w-16`}
                        aria-label="Pommel end"
                    />
                </Label>
                <Label>
                    □
                    <UnitInput
                        units={units}
                        valueMm={w}
                        stepMm={0.5}
                        onChangeMm={setW}
                        className={`${num} w-16`}
                        aria-label="Pommel flat-to-flat width"
                        title="Flat-to-flat width of the square"
                    />
                    {lengthUnit(units)}
                </Label>
                <button
                    type="button"
                    onClick={() => onAdd(x0, x1, w)}
                    className="min-h-11 rounded-md border border-slate-300 px-2.5 py-1 text-sm dark:border-robin-900 dark:hover:bg-dark-lighter"
                >
                    Add
                </button>
            </Row>
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
                            className="min-h-11 min-w-11 rounded border border-slate-300 px-1.5 dark:border-robin-900"
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
