import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../../../lib/units';
import type { RotaryOps, RotaryOperation } from '../../engine/types';

type OpsPatch = Partial<
    Omit<RotaryOps, 'groove' | 'part' | 'pommels' | 'compR'>
> & {
    groove?: Partial<RotaryOps['groove']>;
    part?: Partial<RotaryOps['part']>;
};
export const rotaryInput =
    'mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs text-slate-900 dark:border-robin-900 dark:bg-dark-lighter dark:text-white';
const label = 'block text-xs text-slate-500 dark:text-slate-400';
export function OpsFields({
    units,
    operation,
    ops,
    onPatch,
}: {
    units: UnitSystem;
    operation: RotaryOperation;
    ops: RotaryOps;
    compR: number;
    onPatch(patch: OpsPatch): void;
}): ReactElement {
    const unit = lengthUnit(units);
    return (
        <section className="space-y-3" aria-label="Operations">
            {operation === 'rough' && (
                <>
                    <label className={label}>
                        Roughing allowance ({unit})
                        <UnitInput
                            units={units}
                            valueMm={ops.allow}
                            onChangeMm={(allow) => onPatch({ allow })}
                            minMm={0}
                            maxMm={5}
                            stepMm={0.1}
                            className={rotaryInput}
                            aria-label="Roughing allowance"
                        />
                    </label>
                </>
            )}
            {operation === 'finish' && (
                <>
                    <label className={label}>
                        Finish direction
                        <select
                            value={ops.raster}
                            onChange={(e) =>
                                onPatch({ raster: Number(e.target.value) })
                            }
                            className={rotaryInput}
                            aria-label="Finish raster angle"
                        >
                            <option value={270}>
                                270° (along A, across grain)
                            </option>
                            <option value={0}>0° (along X)</option>
                        </select>
                    </label>
                </>
            )}
            {operation === 'groove' && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <label className={label}>
                            Position X ({unit})
                            <UnitInput
                                units={units}
                                valueMm={ops.groove.x}
                                onChangeMm={(x) => onPatch({ groove: { x } })}
                                stepMm={0.5}
                                className={rotaryInput}
                                aria-label="Groove position"
                            />
                        </label>
                        <label className={label}>
                            Width ({unit})
                            <UnitInput
                                units={units}
                                valueMm={ops.groove.w}
                                onChangeMm={(w) => onPatch({ groove: { w } })}
                                stepMm={0.1}
                                className={rotaryInput}
                                aria-label="Groove width"
                            />
                        </label>
                    </div>
                </>
            )}
            {operation === 'part' && (
                <>
                    <label className={label}>
                        Position X ({unit})
                        <UnitInput
                            units={units}
                            valueMm={ops.part.x}
                            onChangeMm={(x) => onPatch({ part: { x } })}
                            stepMm={0.5}
                            className={rotaryInput}
                            aria-label="Part-off position"
                        />
                    </label>
                </>
            )}
        </section>
    );
}
