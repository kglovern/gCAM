import { UnitInput } from '../components/UnitInput';
import { MATERIAL_RECIPES } from '../cutting-parameters/recipes';
import { displayValue, lengthUnit } from '../lib/units';
import type { JobStock } from './stock';
import type { UnitSystem } from '../lib/units';

/** Shared physical workpiece, configured once per project. */
export function JobStockSetup({
    stock,
    units,
    onChange,
    maxXTravelMm,
    maxYTravelMm,
    machineName,
}: {
    stock: JobStock;
    units: UnitSystem;
    onChange: (stock: JobStock) => void;
    maxXTravelMm: number | null;
    maxYTravelMm: number | null;
    machineName: string;
}) {
    const update = (next: Partial<JobStock>) => onChange({ ...stock, ...next });
    const unit = lengthUnit(units);
    const stockUsesFullTravel =
        maxXTravelMm !== null &&
        maxYTravelMm !== null &&
        Math.abs(stock.widthMm - maxXTravelMm) < 0.05 &&
        Math.abs(stock.heightMm - maxYTravelMm) < 0.05;
    return (
        <section className="job-stock-setup mx-3 mt-3 space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Job stock
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {stockUsesFullTravel ? (
                    <>
                        Starting stock is set to {machineName}'s full working
                        area
                        {maxXTravelMm !== null && maxYTravelMm !== null
                            ? ` (${displayValue(maxXTravelMm, units)} × ${displayValue(maxYTravelMm, units)}${unit})`
                            : ''}
                        . Enter the actual material size before machining.
                    </>
                ) : (
                    'Set these dimensions to match the material fixed on your CNC. They apply to every toolpath in this job.'
                )}
            </p>
            <div className="grid grid-cols-3 gap-2">
                {(
                    [
                        ['Width', 'widthMm'],
                        ['Height', 'heightMm'],
                        ['Thickness', 'thicknessMm'],
                    ] as const
                ).map(([label, field]) => (
                    <label
                        key={field}
                        className="text-xs text-slate-600 dark:text-slate-300"
                    >
                        {label} ({unit})
                        <UnitInput
                            aria-label={`Stock ${label} (${unit})`}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-robin-900 dark:bg-dark"
                            units={units}
                            valueMm={stock[field]}
                            minMm={0.1}
                            stepMm={1}
                            onChangeMm={(value) => update({ [field]: value })}
                        />
                    </label>
                ))}
            </div>
            <label className="block text-xs text-slate-600 dark:text-slate-300">
                Material
                <select
                    aria-label="Stock material"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                    value={stock.material}
                    onChange={(event) =>
                        update({
                            material: event.target
                                .value as JobStock['material'],
                        })
                    }
                >
                    {Object.values(MATERIAL_RECIPES).map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                            {recipe.label}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Shared by all toolpaths and the stock-removal simulation.
            </p>
        </section>
    );
}
