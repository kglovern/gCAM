/** First-run machine selection so travel limits and starting stock are explicit. */
import { useState } from 'react';
import { Box } from 'lucide-react';
import {
    CUSTOM_MACHINE_PROFILE_ID,
    DEFAULT_MACHINE_PROFILE,
    MACHINE_PROFILES,
    machineProfileById,
} from '../cutting-parameters/machines';
import type { MachineTravelLimits } from '../cutting-parameters/types';
import { displayValue, lengthUnit, toMm, type UnitSystem } from '../lib/units';

interface MachineSetupModalProps {
    units: UnitSystem;
    machineProfileId: string;
    onChoose(
        profileId: string,
        limits: MachineTravelLimits,
        units: UnitSystem,
    ): void;
}

const fieldClass =
    'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-robin-500 focus:outline-none focus:ring-2 focus:ring-robin-500/30 dark:border-robin-900 dark:bg-dark dark:text-white';

export function MachineSetupModal({
    units: initialUnits,
    machineProfileId,
    onChoose,
}: MachineSetupModalProps) {
    const [units, setUnits] = useState(initialUnits);
    const [profileId, setProfileId] = useState(
        machineProfileId || DEFAULT_MACHINE_PROFILE.id,
    );
    const [custom, setCustom] = useState({ x: '', y: '', z: '' });
    const selectedProfile = machineProfileById(profileId);
    const customValues = {
        x: Number(custom.x),
        y: Number(custom.y),
        z: Number(custom.z),
    };
    const customValid = Object.values(customValues).every(
        (value) => Number.isFinite(value) && value > 0,
    );

    const choose = () => {
        if (selectedProfile) {
            onChoose(
                profileId,
                {
                    maxXTravelMm: selectedProfile.maxXTravelMm,
                    maxYTravelMm: selectedProfile.maxYTravelMm,
                    minZTravelMm: -selectedProfile.maxZTravelMm,
                    maxZTravelMm: null,
                },
                units,
            );
            return;
        }
        if (!customValid) return;
        onChoose(
            CUSTOM_MACHINE_PROFILE_ID,
            {
                maxXTravelMm: toMm(customValues.x, units),
                maxYTravelMm: toMm(customValues.y, units),
                minZTravelMm: -toMm(customValues.z, units),
                maxZTravelMm: null,
            },
            units,
        );
    };

    return (
        <div
            className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4"
            role="presentation"
        >
            <section
                aria-labelledby="machine-setup-title"
                aria-modal="true"
                className="w-full max-w-lg max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-robin-900 dark:bg-slate-900"
                role="dialog"
            >
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-robin-100 text-robin-700 dark:bg-robin-950 dark:text-robin-300">
                        <Box size={20} />
                    </span>
                    <div>
                        <h2
                            id="machine-setup-title"
                            className="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                            Choose your CNC machine
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Tell us about your machine and preferences to get
                            started.
                        </p>
                    </div>
                </div>

                <label className="mt-6 block text-sm font-medium text-slate-800 dark:text-slate-100">
                    Preferred units
                    <select
                        className={fieldClass}
                        value={units}
                        onChange={(event) => {
                            const next = event.target.value as UnitSystem;
                            setCustom(
                                (current) =>
                                    Object.fromEntries(
                                        Object.entries(current).map(
                                            ([axis, value]) => [
                                                axis,
                                                value === ''
                                                    ? ''
                                                    : String(
                                                          displayValue(
                                                              toMm(
                                                                  Number(value),
                                                                  units,
                                                              ),
                                                              next,
                                                              4,
                                                          ),
                                                      ),
                                            ],
                                        ),
                                    ) as typeof current,
                            );
                            setUnits(next);
                        }}
                    >
                        <option value="metric">Millimetres (mm)</option>
                        <option value="imperial">Inches (in)</option>
                    </select>
                </label>

                <label
                    className="mt-6 block text-sm font-medium text-slate-800 dark:text-slate-100"
                    htmlFor="first-machine"
                >
                    Machine
                </label>
                <select
                    id="first-machine"
                    className={fieldClass}
                    value={profileId}
                    onChange={(event) => setProfileId(event.target.value)}
                >
                    {MACHINE_PROFILES.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                            {profile.displayName}
                        </option>
                    ))}
                    <option value={CUSTOM_MACHINE_PROFILE_ID}>
                        Custom machine
                    </option>
                </select>

                {selectedProfile ? (
                    <div className="mt-3 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Working area:{' '}
                        {displayValue(selectedProfile.maxXTravelMm, units, 1)} ×{' '}
                        {displayValue(selectedProfile.maxYTravelMm, units, 1)} ×{' '}
                        {displayValue(selectedProfile.maxZTravelMm, units, 1)}{' '}
                        {lengthUnit(units)}
                    </div>
                ) : (
                    <div className="mt-3 rounded-lg border border-slate-200 p-4 dark:border-robin-900">
                        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                            Enter the maximum travel shown for your CNC. You can
                            change this later in Config.
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {(['x', 'y', 'z'] as const).map((axis) => (
                                <label
                                    key={axis}
                                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                                >
                                    Max {axis.toUpperCase()} (
                                    {lengthUnit(units)})
                                    <input
                                        aria-label={`Maximum ${axis.toUpperCase()} travel`}
                                        className={fieldClass}
                                        min="0"
                                        step="any"
                                        type="number"
                                        value={custom[axis]}
                                        onChange={(event) =>
                                            setCustom((current) => ({
                                                ...current,
                                                [axis]: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                    Stock starts at the machine’s full working area as a guide.
                    Set your actual stock size before creating toolpaths.
                </p>
                <button
                    className="mt-6 w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!selectedProfile && !customValid}
                    onClick={choose}
                    type="button"
                >
                    Use this machine
                </button>
            </section>
        </div>
    );
}
