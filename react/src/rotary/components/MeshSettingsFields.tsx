import { profileMachiningSettings } from '../engine/profilePaths';
import { lengthUnit } from '../../lib/units';
import { RotarySettingsBoundary } from './RotarySettingsBoundary';
import { UnitInput } from '../../components/UnitInput';
import type { UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import {
    defaultMeshSettings,
    meshSettingsForTool,
} from '../engine/meshToolpath';
import type { RotaryMeshSettings } from '../engine/types';
import { rotaryInput } from './fields/OpsFields';

export function MeshSettingsFields({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    if (R.operation !== 'rough' && R.operation !== 'finish') return null;
    const profile = R.mode === 'profile';
    const value = profile
        ? profileMachiningSettings(R.opsBase, R.tool, R.operation === 'rough')
        : (R.opsBase.mesh ?? defaultMeshSettings);
    const indexed =
        value.strategy === 'indexed' || value.strategy === 'simultaneous';
    const patch = (next: Partial<RotaryMeshSettings>) => {
        R.setOpsBase((old) => ({
            ...old,
            ...(profile && next.strategy
                ? { raster: next.strategy === 'along' ? 0 : 270 }
                : {}),
            mesh: { ...value, ...next },
        }));
    };
    return (
        <RotarySettingsBoundary onBeforeChange={R.pushHistory}>
            <section
                aria-label="XYZA mesh settings"
                className="space-y-3 border-t border-slate-200 pt-3 dark:border-robin-900"
            >
                <h3 className="text-xs uppercase text-slate-500">
                    3D machining
                </h3>
                <label className="block text-sm text-slate-700 dark:text-slate-200">
                    Cutting pattern
                    <select
                        className={rotaryInput}
                        aria-label="Mesh strategy"
                        value={value.strategy}
                        onChange={(event) =>
                            patch({
                                strategy: event.target
                                    .value as RotaryMeshSettings['strategy'],
                            })
                        }
                    >
                        <option value="around">Around stock</option>
                        <option value="along">Along stock</option>
                        {R.operation === 'finish' && (
                            <option value="helix">Helix</option>
                        )}
                        {!profile && (
                            <option value="indexed">
                                Indexed sides (XYZ + A)
                            </option>
                        )}
                        {!profile && value.strategy === 'simultaneous' && (
                            <option value="simultaneous">
                                Legacy XYZA ribbon
                            </option>
                        )}
                    </select>
                </label>
                {R.operation === 'finish' && (
                    <label className="block text-sm text-slate-700 dark:text-slate-200">
                        Finish quality
                        <select
                            aria-label="Finish quality"
                            className={rotaryInput}
                            value={
                                [0.1, 0.25, 0.5].includes(value.tolerance)
                                    ? String(value.tolerance)
                                    : 'custom'
                            }
                            onChange={(event) => {
                                if (event.target.value === 'custom') return;
                                patch(
                                    meshSettingsForTool(
                                        {
                                            ...value,
                                            tolerance: Number(
                                                event.target.value,
                                            ),
                                        },
                                        R.tool.dia,
                                        false,
                                    ),
                                );
                            }}
                        >
                            <option value="0.5">Coarse</option>
                            <option value="0.25">Standard</option>
                            <option value="0.1">Fine</option>
                            <option value="custom" disabled>
                                Custom
                            </option>
                        </select>
                    </label>
                )}
                <details>
                    <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">
                        Advanced machining settings
                    </summary>
                    <div className="mt-3 space-y-3">
                        <label className="block text-xs text-slate-500">
                            Finish tolerance ({lengthUnit(units)})
                            <UnitInput
                                aria-label="Finish tolerance"
                                units={units}
                                valueMm={value.tolerance}
                                stepMm={0.05}
                                minMm={0.02}
                                className={rotaryInput}
                                onChangeMm={(tolerance) =>
                                    patch(
                                        meshSettingsForTool(
                                            { ...value, tolerance },
                                            R.tool.dia,
                                            R.operation === 'rough',
                                        ),
                                    )
                                }
                            />
                        </label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {(
                                [
                                    ['cellSize', 'Mesh cell'],
                                    ['stepover', 'Stepover'],
                                    ['shankDiameter', 'Shank diameter'],
                                    ['holderDiameter', 'Holder diameter'],
                                    ['tailClearance', 'Tailstock clearance'],
                                    ['clearance', 'Safe clearance'],
                                ] as const
                            ).map(
                                ([key, label]) =>
                                    (key !== 'cellSize' || indexed) && (
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
                                                onChangeMm={(n) =>
                                                    patch({ [key]: n })
                                                }
                                            />
                                        </label>
                                    ),
                            )}
                            {indexed && (
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
                                        onChangeMm={(angleStep) =>
                                            patch({ angleStep })
                                        }
                                    />
                                </label>
                            )}
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
                                    onChangeMm={(rotaryRate) =>
                                        patch({ rotaryRate })
                                    }
                                />
                            </label>
                        </div>
                        <p className="text-xs text-slate-500">
                            Shank and holder diameters are optional (0 =
                            unspecified) and increase the fixture clearance when
                            supplied. Stock axis is X; Z zero is the rotary
                            centre.
                        </p>
                    </div>
                </details>
            </section>
        </RotarySettingsBoundary>
    );
}
