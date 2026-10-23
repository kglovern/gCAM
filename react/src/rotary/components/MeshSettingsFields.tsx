import { lengthUnit } from '../../lib/units';
import { RotarySettingsBoundary } from './RotarySettingsBoundary';
import { UnitInput } from '../../components/UnitInput';
import type { UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import { defaultMeshSettings } from '../engine/meshToolpath';
import type { RotaryMeshSettings } from '../engine/types';
import { rotaryInput } from './fields/OpsFields';

export function MeshSettingsFields({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    if (R.mode !== 'stl') return null;
    const value = R.opsBase.mesh ?? defaultMeshSettings;
    const patch = (next: Partial<RotaryMeshSettings>) => {
        R.setOpsBase((old) => ({ ...old, mesh: { ...value, ...next } }));
    };
    return (
        <RotarySettingsBoundary onBeforeChange={R.pushHistory}>
            <section
                aria-label="XYZA mesh settings"
                className="space-y-3 border-t border-slate-200 pt-3 dark:border-robin-900"
            >
                <h3 className="text-xs uppercase text-slate-500">
                    XYZA mesh machining
                </h3>
                <label className="block text-xs text-slate-500">
                    Strategy
                    <select
                        className={rotaryInput}
                        aria-label="Mesh strategy"
                        value={value.strategy}
                        onChange={(e) =>
                            patch({
                                strategy: e.target
                                    .value as RotaryMeshSettings['strategy'],
                            })
                        }
                    >
                        <option value="indexed">Indexed XYZ + A</option>
                        <option value="simultaneous">
                            Simultaneous XYZA finish
                        </option>
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {(
                        [
                            ['cellSize', 'Mesh cell'],
                            ['tolerance', 'Finish tolerance'],
                            ['stepover', 'Stepover'],
                            ['fluteLength', 'Flute length'],
                            ['shankDiameter', 'Shank diameter'],
                            ['stickout', 'Tool stickout'],
                            ['holderDiameter', 'Holder diameter'],
                            ['tailClearance', 'Tailstock clearance'],
                            ['clearance', 'Safe clearance'],
                        ] as const
                    ).map(([key, label]) => (
                        <label
                            key={key}
                            className="block text-xs text-slate-500"
                        >
                            {label} ({lengthUnit(units)})
                            <UnitInput
                                aria-label={label}
                                units={units}
                                valueMm={value[key]}
                                stepMm={0.1}
                                minMm={0}
                                className={rotaryInput}
                                onChangeMm={(n) => patch({ [key]: n })}
                            />
                        </label>
                    ))}
                    <label className="block text-xs text-slate-500">
                        A spacing (°)
                        <UnitInput
                            aria-label="A spacing"
                            units="metric"
                            valueMm={value.angleStep}
                            minMm={1}
                            maxMm={90}
                            stepMm={1}
                            decimals={1}
                            className={rotaryInput}
                            onChangeMm={(angleStep) => patch({ angleStep })}
                        />
                    </label>
                    <label className="block text-xs text-slate-500">
                        A rate limit (°/min)
                        <UnitInput
                            aria-label="A rate limit"
                            units="metric"
                            valueMm={value.rotaryRate}
                            minMm={1}
                            stepMm={10}
                            decimals={1}
                            className={rotaryInput}
                            onChangeMm={(rotaryRate) => patch({ rotaryRate })}
                        />
                    </label>
                </div>
                <label className="flex gap-2 text-xs">
                    <input
                        type="checkbox"
                        checked={value.independentAxis}
                        onChange={(e) =>
                            patch({ independentAxis: e.target.checked })
                        }
                    />
                    Machine has independent X, Y, Z and A axes
                </label>
                <p className="text-xs text-slate-500">
                    Enter measured tool and holder dimensions. Stock axis is X;
                    Z zero is the rotary centre. Attachment end faces and hidden
                    undercuts need separate machining.
                </p>
            </section>
        </RotarySettingsBoundary>
    );
}
