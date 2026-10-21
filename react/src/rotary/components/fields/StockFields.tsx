import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import { lengthUnit, feedUnit, type UnitSystem } from '../../../lib/units';
import { panel, h2, hint, num, check, Row, Label } from './FieldLayout';
import type { RotaryStock } from '../../engine/types';
export function StockFields({
    stock,
    units,
    onPatch,
}: {
    stock: RotaryStock;
    units: UnitSystem;
    onPatch: (patch: Partial<RotaryStock>) => void;
}): ReactElement {
    return (
        <section className={panel} aria-label="Stock">
            <h2 className={h2}>Stock</h2>
            <Row>
                <Label>
                    Length
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={stock.length}
                        onChangeMm={(v) => onPatch({ length: v })}
                        minMm={10}
                        maxMm={1003}
                        stepMm={0.5}
                        className={num}
                        aria-label="Stock length"
                    />
                    {lengthUnit(units)}
                </Label>
                <Label>
                    Ø
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={stock.diameter}
                        onChangeMm={(v) => onPatch({ diameter: v })}
                        minMm={6}
                        maxMm={101.6}
                        stepMm={0.5}
                        className={num}
                        aria-label="Stock diameter"
                    />
                    {lengthUnit(units)}
                </Label>
            </Row>
            <Row>
                <Label>
                    Grip
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={stock.grip}
                        onChangeMm={(v) => onPatch({ grip: v })}
                        minMm={0}
                        maxMm={100}
                        stepMm={1}
                        className={num}
                        aria-label="Chuck grip length"
                        title="Length held in chuck jaws — no cutting here"
                    />
                    {lengthUnit(units)}
                </Label>
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={stock.ext}
                        onChange={(e) => onPatch({ ext: e.target.checked })}
                    />
                    Ext. track (39.5&Prime;)
                </label>
            </Row>
            <p className={hint}>
                Max Ø 101.6mm (4&Prime;), max length 546mm (21.5&Prime;) —
                1003mm with extension. Min 19mm grip in jaws.
            </p>
        </section>
    );
}
