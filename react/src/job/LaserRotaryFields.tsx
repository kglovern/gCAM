import {
    DEFAULT_LASER_ROTARY,
    type LaserRotarySetup,
} from '../cam/laser-rotary.js';
import { UnitInput } from '../components/UnitInput';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import type { JobStock } from './stock';

export function LaserRotaryFields({
    stock,
    onChange,
    units,
}: {
    stock: JobStock;
    onChange: (stock: JobStock) => void;
    units: UnitSystem;
}) {
    const setup = stock.laserRotary;
    const update = (next: Partial<LaserRotarySetup>) =>
        setup &&
        onChange({
            ...stock,
            laserRotary: { ...setup, confirmed: false, ...next },
        });
    const input =
        'w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white';
    return (
        <details className="mt-2 text-xs" open={!!setup}>
            <summary className="cursor-pointer">Rotary attachment</summary>
            <label className="my-2 flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!setup}
                    onChange={(e) =>
                        onChange({
                            ...stock,
                            laserRotary: e.target.checked
                                ? ({
                                      ...DEFAULT_LASER_ROTARY,
                                  } as LaserRotarySetup)
                                : undefined,
                        })
                    }
                />
                Use a rotary attachment
            </label>
            {setup && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <label>
                            Attachment
                            <select
                                aria-label="Laser rotary type"
                                className={input}
                                value={setup.type}
                                onChange={(e) =>
                                    update({
                                        type: e.target
                                            .value as LaserRotarySetup['type'],
                                    })
                                }
                            >
                                <option value="chuck">Chuck</option>
                                <option value="roller">Roller</option>
                            </select>
                        </label>
                        <label>
                            Controller axis
                            <select
                                aria-label="Laser rotary axis"
                                className={input}
                                value={setup.axis}
                                onChange={(e) =>
                                    update({
                                        axis: e.target
                                            .value as LaserRotarySetup['axis'],
                                        unitsPerTurn:
                                            e.target.value === 'A' ? 360 : 100,
                                    })
                                }
                            >
                                <option>Y</option>
                                <option>Z</option>
                                <option>A</option>
                            </select>
                        </label>
                        <label>
                            Object diameter ({lengthUnit(units)})
                            <UnitInput
                                aria-label="Laser object diameter"
                                className={input}
                                units={units}
                                valueMm={setup.objectDiameter}
                                onChangeMm={(objectDiameter) =>
                                    update({ objectDiameter })
                                }
                            />
                        </label>
                        {setup.type === 'roller' && (
                            <label>
                                Roller diameter ({lengthUnit(units)})
                                <UnitInput
                                    aria-label="Laser roller diameter"
                                    className={input}
                                    units={units}
                                    valueMm={setup.rollerDiameter}
                                    onChangeMm={(rollerDiameter) =>
                                        update({ rollerDiameter })
                                    }
                                />
                            </label>
                        )}
                        <label className="col-span-2">
                            {setup.axis === 'A'
                                ? 'Degrees'
                                : 'Controller travel (' +
                                  lengthUnit(units) +
                                  ')'}{' '}
                            per revolution
                            {setup.axis === 'A' ? (
                                <input
                                    aria-label="Laser travel per revolution"
                                    className={input}
                                    type="number"
                                    value={setup.unitsPerTurn}
                                    onChange={(e) =>
                                        update({
                                            unitsPerTurn: Number(
                                                e.target.value,
                                            ),
                                        })
                                    }
                                />
                            ) : (
                                <UnitInput
                                    aria-label="Laser travel per revolution"
                                    className={input}
                                    units={units}
                                    valueMm={setup.unitsPerTurn}
                                    onChangeMm={(unitsPerTurn) =>
                                        update({ unitsPerTurn })
                                    }
                                />
                            )}
                        </label>
                    </div>
                    <p className="my-2 text-slate-500">
                        X runs along the object; Y wraps around it. A full turn
                        is of the{' '}
                        {setup.type === 'roller' ? 'driven roller' : 'object'}.
                    </p>
                    {setup.axis === 'A' && (
                        <p className="my-2 text-slate-500">
                            A output needs an independent grblHAL rotary axis
                            and metric output.
                        </p>
                    )}
                    <label className="my-2 flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={setup.reverse}
                            onChange={(e) =>
                                update({ reverse: e.target.checked })
                            }
                        />
                        Reverse rotation
                    </label>
                    <label className="my-2 flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={setup.confirmed}
                            onChange={(e) =>
                                update({ confirmed: e.target.checked })
                            }
                        />
                        Axis and travel per revolution checked
                    </label>
                    <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1"
                        onClick={() =>
                            onChange({
                                ...stock,
                                heightMm: Math.PI * setup.objectDiameter,
                            })
                        }
                    >
                        Use circumference as height (
                        {displayValue(Math.PI * setup.objectDiameter, units)}{' '}
                        {lengthUnit(units)})
                    </button>
                </>
            )}
        </details>
    );
}
