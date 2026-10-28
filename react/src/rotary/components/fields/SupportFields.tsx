import { UnitInput } from '../../../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../../../lib/units';
import { defaultSupports } from '../../engine/supports';
import type { RotaryStock, RotarySupports } from '../../engine/types';
import { RotarySettingsBoundary } from '../RotarySettingsBoundary';

export function SupportFields({
    stock,
    units,
    onPatch,
    onBeforeChange,
}: {
    stock: RotaryStock;
    units: UnitSystem;
    onPatch(patch: Partial<RotaryStock>): void;
    onBeforeChange(): void;
}) {
    const supports = stock.supports ?? { ...defaultSupports, enabled: false };
    const patch = (change: Partial<RotarySupports>) =>
        onPatch({ supports: { ...supports, ...change } });
    return (
        <section
            aria-label="Stock supports"
            className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-robin-900"
        >
            <RotarySettingsBoundary onBeforeChange={onBeforeChange}>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={supports.enabled}
                        onChange={(event) =>
                            patch({ enabled: event.target.checked })
                        }
                    />
                    Keep stock supports
                </label>
                {supports.enabled && (
                    <>
                        <p className="text-xs text-slate-500">
                            Orange material is retained. End overlaps extend
                            into the part. Remove supports manually; part-off is
                            blocked.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {(
                                [
                                    ['coreDiameter', 'Core diameter'],
                                    ['endDiameter', 'End support diameter'],
                                    ['chuckOverlap', 'Chuck end overlap'],
                                    ['tailOverlap', 'Tailstock end overlap'],
                                ] as const
                            ).map(([key, label]) => (
                                <label
                                    key={key}
                                    className="text-xs text-slate-600 dark:text-slate-300"
                                >
                                    <span className="block min-h-8">
                                        {label} ({lengthUnit(units)})
                                    </span>
                                    <UnitInput
                                        units={units}
                                        valueMm={supports[key]}
                                        onChangeMm={(value) =>
                                            patch({ [key]: value })
                                        }
                                        minMm={
                                            key.endsWith('Diameter') ? 0.1 : 0
                                        }
                                        maxMm={
                                            key.endsWith('Diameter')
                                                ? stock.diameter
                                                : stock.length
                                        }
                                        stepMm={0.5}
                                        aria-label={label}
                                        className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-robin-900"
                                    />
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                            Choose support sizes for your material and part
                            length. Small cores can flex or break.
                        </p>
                    </>
                )}
            </RotarySettingsBoundary>
        </section>
    );
}
