import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { LASER_DEFAULTS } from '../cam/laser.js';
import type { LaserOptions } from './toolpathRequest';
const input =
    'w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white';
export function LaserImageAdjustments({
    options,
    update,
    units,
    className = 'col-span-2 grid grid-cols-2 gap-2 disabled:opacity-50',
}: {
    options: LaserOptions;
    update(patch: LaserOptions): void;
    units: UnitSystem;
    className?: string;
}) {
    const o = { ...(LASER_DEFAULTS as Required<LaserOptions>), ...options };
    return (
        <fieldset disabled={o.passThrough} className={className}>
            <label>
                Image mode
                <select
                    className={input}
                    value={o.imageMode}
                    onChange={(e) =>
                        update({
                            imageMode: e.target
                                .value as LaserOptions['imageMode'],
                        })
                    }
                >
                    <option value="grayscale">Grayscale</option>
                    <option value="halftone">Halftone dots</option>
                    <option value="edge">Edges only</option>
                    <option value="threshold">Threshold</option>
                    <option value="ordered">Ordered dither</option>
                    <option value="atkinson">Atkinson</option>
                    <option value="jarvis">Jarvis</option>
                    <option value="stucki">Stucki</option>
                    <option value="floyd-steinberg">Floyd–Steinberg</option>
                </select>
            </label>
            {o.imageMode === 'halftone' && (
                <>
                    <label>
                        Dot spacing ({lengthUnit(units)})
                        <UnitInput
                            aria-label="Halftone dot spacing"
                            className={input}
                            units={units}
                            minMm={0.01}
                            stepMm={0.1}
                            valueMm={o.halftoneCellSize}
                            onChangeMm={(value) =>
                                update({
                                    halftoneCellSize: value,
                                })
                            }
                        />
                    </label>
                    <label>
                        Pattern angle (°)
                        <input
                            aria-label="Halftone pattern angle"
                            className={input}
                            type="number"
                            min={-360}
                            max={360}
                            value={o.halftoneAngle}
                            onChange={(e) =>
                                update({
                                    halftoneAngle: Number(e.target.value),
                                })
                            }
                        />
                    </label>
                </>
            )}
            {o.imageMode === 'edge' && (
                <label>
                    Edge strength
                    <input
                        aria-label="Edge strength"
                        className={input}
                        type="number"
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={o.edgeGain}
                        onChange={(e) =>
                            update({
                                edgeGain: Number(e.target.value),
                            })
                        }
                    />
                </label>
            )}
            <label>
                Threshold
                <input
                    className={input}
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={o.threshold}
                    onChange={(e) =>
                        update({
                            threshold: Number(e.target.value),
                        })
                    }
                />
            </label>
            <label>
                Grayscale
                <select
                    aria-label="Grayscale channel"
                    className={input}
                    value={o.grayscale}
                    onChange={(e) =>
                        update({
                            grayscale: e.target
                                .value as Required<LaserOptions>['grayscale'],
                        })
                    }
                >
                    {(
                        [
                            'luminance',
                            'average',
                            'red',
                            'green',
                            'blue',
                            'minimum',
                            'maximum',
                        ] as const
                    ).map((value) => (
                        <option key={value} value={value}>
                            {value[0].toUpperCase() + value.slice(1)}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Shades (0 = continuous)
                <input
                    aria-label="Grayscale shades"
                    className={input}
                    type="number"
                    min={0}
                    max={256}
                    step={1}
                    value={o.shadeCount}
                    onChange={(e) =>
                        update({
                            shadeCount: Number(e.target.value),
                        })
                    }
                />
            </label>
            <label>
                Brightness
                <input
                    className={input}
                    type="number"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={o.brightness}
                    onChange={(e) =>
                        update({
                            brightness: Number(e.target.value),
                        })
                    }
                />
            </label>
            <label>
                Contrast
                <input
                    className={input}
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={o.contrast}
                    onChange={(e) =>
                        update({
                            contrast: Number(e.target.value),
                        })
                    }
                />
            </label>
            {(['smoothing', 'sharpening'] as const).map((key) => (
                <label key={key}>
                    {key === 'smoothing' ? 'Smoothing' : 'Sharpening'}
                    <input
                        className={input}
                        type="number"
                        min="0"
                        max={key === 'smoothing' ? 1 : 2}
                        step="0.1"
                        value={o[key]}
                        onChange={(e) =>
                            update({
                                [key]: Number(e.target.value),
                            })
                        }
                    />
                </label>
            ))}
            <label>
                Filter radius (source px)
                <input
                    aria-label="Image filter radius"
                    className={input}
                    type="number"
                    min="1"
                    max="16"
                    step="1"
                    value={o.filterRadius}
                    onChange={(e) =>
                        update({ filterRadius: Number(e.target.value) })
                    }
                />
            </label>
            <label>
                Sharpening denoise
                <input
                    aria-label="Sharpening denoise"
                    className={input}
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={o.sharpeningDenoise}
                    onChange={(e) =>
                        update({ sharpeningDenoise: Number(e.target.value) })
                    }
                />
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={o.invert}
                    onChange={(e) => update({ invert: e.target.checked })}
                />{' '}
                Invert image
            </label>
        </fieldset>
    );
}
