import { UnitInput } from '../../../components/UnitInput';
import { ROTARY_MAX_DIAMETER, rotaryMaxLength } from '../../engine/stockLimits';
import { MATERIAL_RECIPES } from '../../../cutting-parameters/recipes';
import type { MaterialId } from '../../../cutting-parameters/types';
import { lengthUnit, type UnitSystem } from '../../../lib/units';
import type { RotaryStock } from '../../engine/types';
import { RotarySettingsBoundary } from '../RotarySettingsBoundary';

export function StockFields({
    stock,
    units,
    material,
    onPatch,
    onMaterialChange,
    onBeforeChange,
}: {
    stock: RotaryStock;
    units: UnitSystem;
    material: MaterialId;
    onPatch(patch: Partial<RotaryStock>): void;
    onMaterialChange(material: MaterialId): void;
    onBeforeChange(): void;
}) {
    const unit = lengthUnit(units);
    const input =
        'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-robin-900 dark:bg-dark';
    return (
        <section
            aria-label="Rotary job stock"
            className="space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50"
        >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Job stock
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Enter your measured round blank size, including the end held in
                the chuck. These are wood dimensions, not model dimensions.
            </p>
            <RotarySettingsBoundary onBeforeChange={onBeforeChange}>
                <label className="block text-xs text-slate-600 dark:text-slate-300">
                    Machine capacity
                    <select
                        aria-label="Rotary machine capacity"
                        value={stock.ext ? 'extended' : 'standard'}
                        onChange={(event) =>
                            onPatch({ ext: event.target.value === 'extended' })
                        }
                        className={input}
                    >
                        <option value="standard">
                            Standard — 546 mm usable
                        </option>
                        <option value="extended">
                            Extended — 1003 mm usable
                        </option>
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                        Length ({unit})
                        <UnitInput
                            units={units}
                            kind="length"
                            valueMm={stock.length}
                            onChangeMm={(length) => onPatch({ length })}
                            minMm={10}
                            maxMm={rotaryMaxLength(stock.ext)}
                            stepMm={0.5}
                            className={input}
                            aria-label="Stock length"
                        />
                    </label>
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                        Diameter ({unit})
                        <UnitInput
                            units={units}
                            kind="length"
                            valueMm={stock.diameter}
                            onChangeMm={(diameter) => onPatch({ diameter })}
                            minMm={6}
                            maxMm={ROTARY_MAX_DIAMETER}
                            stepMm={0.5}
                            className={input}
                            aria-label="Stock diameter"
                        />
                    </label>
                </div>
            </RotarySettingsBoundary>
            <label className="block text-xs text-slate-600 dark:text-slate-300">
                Material
                <select
                    aria-label="Rotary stock material"
                    value={material}
                    onChange={(event) =>
                        onMaterialChange(event.target.value as MaterialId)
                    }
                    className={`${input} text-slate-900 dark:text-white`}
                >
                    {Object.values(MATERIAL_RECIPES).map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                            {recipe.label}
                        </option>
                    ))}
                </select>
            </label>
        </section>
    );
}
