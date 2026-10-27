/**
 * Purpose: Implementation module for UnitInput in the components domain.
 */
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import {
    displayFeed,
    displayValue,
    fromMm,
    toMm,
    toMmPerMinute,
    type UnitSystem,
} from '../lib/units';

type Kind = 'length' | 'feed';

interface UnitInputProps
    extends Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'value' | 'onChange' | 'min' | 'max' | 'step'
    > {
    units: UnitSystem;
    kind?: Kind;
    valueMm: number;
    onChangeMm: (valueMm: number) => void;
    minMm?: number;
    maxMm?: number;
    stepMm?: number;
    decimals?: number;
}

/** A numeric field backed by millimetres while displaying the selected units. */
export function UnitInput({
    units,
    kind = 'length',
    valueMm,
    onChangeMm,
    minMm,
    maxMm,
    stepMm,
    decimals = kind === 'feed' ? 1 : 3,
    ...props
}: UnitInputProps) {
    const display =
        kind === 'feed'
            ? displayFeed(valueMm, units, decimals)
            : displayValue(valueMm, units, decimals);
    const convert = kind === 'feed' ? toMmPerMinute : toMm;
    // Keep a text draft while focused. A controlled numeric value alone turns
    // an empty field into 0 on every keypress, making normal replacement and
    // decimal entry impossible in CAM parameter fields.
    const [draft, setDraft] = useState(String(display));
    const [editing, setEditing] = useState(false);
    useEffect(() => {
        if (!editing) setDraft(String(display));
    }, [display, editing]);
    return (
        <input
            {...props}
            type="number"
            value={editing ? draft : display}
            min={
                minMm == null ? undefined : displayValue(minMm, units, decimals)
            }
            max={
                maxMm == null ? undefined : displayValue(maxMm, units, decimals)
            }
            step={
                stepMm == null
                    ? undefined
                    : displayValue(stepMm, units, decimals)
            }
            onFocus={(event) => {
                setEditing(true);
                props.onFocus?.(event);
            }}
            onBlur={(event) => {
                setEditing(false);
                const next = Number(event.target.value);
                if (
                    event.target.value !== '' &&
                    Number.isFinite(next) &&
                    next !== Number(display)
                ) {
                    onChangeMm(convert(next, units));
                }
                props.onBlur?.(event);
            }}
            onChange={(event) => {
                setDraft(event.target.value);
                if (event.target.value === '') return;
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onChangeMm(convert(next, units));
            }}
        />
    );
}

export { fromMm };
