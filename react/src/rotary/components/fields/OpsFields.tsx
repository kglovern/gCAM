import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import { lengthUnit, feedUnit, type UnitSystem } from '../../../lib/units';
import { panel, h2, hint, num, check, Row, Label } from './FieldLayout';
import type { RotaryOps } from '../../engine/types';
type OpsPatch = Partial<
    Omit<RotaryOps, 'groove' | 'part' | 'pommels' | 'compR'>
> & {
    groove?: Partial<RotaryOps['groove']>;
    part?: Partial<RotaryOps['part']>;
};

export function OpsFields({
    units,
    ops,
    compR,
    onPatch,
}: {
    units: UnitSystem;
    ops: RotaryOps;
    compR: number;
    onPatch: (patch: OpsPatch) => void;
}): ReactElement {
    return (
        <section className={panel} aria-label="Operations">
            <h2 className={h2}>Operations</h2>
            <div className="mt-2 grid grid-cols-1 items-center gap-3">
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={ops.face}
                        onChange={(e) => onPatch({ face: e.target.checked })}
                    />
                    Face end
                </label>
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={ops.rough}
                        onChange={(e) => onPatch({ rough: e.target.checked })}
                    />
                    Rough +
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={ops.allow}
                        onChangeMm={(v) => onPatch({ allow: v })}
                        minMm={0}
                        maxMm={5}
                        stepMm={0.1}
                        className={`${num} w-16`}
                        aria-label="Roughing allowance"
                        title="Allowance left for finish"
                    />
                    {lengthUnit(units)}
                </label>
                <Label>
                    Stepdown
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={ops.roughStep}
                        onChangeMm={(v) => onPatch({ roughStep: v })}
                        minMm={0.2}
                        maxMm={12}
                        stepMm={0.1}
                        className={`${num} w-16`}
                        aria-label="Roughing stepdown"
                    />
                    {lengthUnit(units)}
                </Label>
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={ops.finish}
                        onChange={(e) => onPatch({ finish: e.target.checked })}
                    />
                    Finish
                </label>
                <Label>
                    Raster
                    <select
                        value={ops.raster}
                        onChange={(e) =>
                            onPatch({ raster: Number(e.target.value) })
                        }
                        className={`${num} w-auto max-w-full`}
                        aria-label="Finish raster angle"
                    >
                        <option value={270}>
                            270° (along A, across grain)
                        </option>
                        <option value={0}>0° (along X)</option>
                    </select>
                </Label>
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={ops.groove.on}
                        onChange={(e) =>
                            onPatch({ groove: { on: e.target.checked } })
                        }
                    />
                    Groove @X
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={ops.groove.x}
                        onChangeMm={(v) => onPatch({ groove: { x: v } })}
                        stepMm={0.5}
                        className={`${num} w-16`}
                        aria-label="Groove position"
                    />
                    w
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={ops.groove.w}
                        onChangeMm={(v) => onPatch({ groove: { w: v } })}
                        stepMm={0.1}
                        className={`${num} w-16`}
                        aria-label="Groove width"
                    />
                    {lengthUnit(units)}
                </label>
                <label className={check}>
                    <input
                        type="checkbox"
                        checked={ops.part.on}
                        onChange={(e) =>
                            onPatch({ part: { on: e.target.checked } })
                        }
                    />
                    Part-off @X
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={ops.part.x}
                        onChangeMm={(v) => onPatch({ part: { x: v } })}
                        stepMm={0.5}
                        className={`${num} w-16`}
                        aria-label="Part-off position"
                    />
                    {lengthUnit(units)}
                </label>
            </div>
            <p className={hint}>
                Rough peels stepped cylinders. Finish rasters across A, like
                VCarve. Groove/part plunge + spin A360.
            </p>
            <p className={hint}>
                {compR > 0
                    ? `Ballnose tooltip comp R${compR.toFixed(2)}: tip exact on flats, tangent on slopes.`
                    : 'No cutter comp — drawn envelope is the finished shape (turning).'}
            </p>
        </section>
    );
}
