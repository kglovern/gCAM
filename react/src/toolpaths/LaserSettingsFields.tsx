import { LaserImageAdjustments } from './LaserImageAdjustments';
import { LaserSettingsTransfer } from './LaserSettingsTransfer';
import type {
    CopiedLaserSettings,
    LaserSettingsSource,
} from './copy-laser-settings';
import { LaserImagePresets } from './LaserImagePresets';
import { LaserIntervalTest } from './LaserIntervalTest';
import { LaserFocusTest } from './LaserFocusTest';
import { LaserMaterialLibrary } from './LaserMaterialLibrary';
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { UnitInput } from '../components/UnitInput';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';
import type { JobStock } from '../job/stock';
import type { LaserOptions } from './toolpathRequest';
import { LASER_DEFAULTS } from '../cam/laser.js';
import {
    type LaserRecipe,
    loadLaserRecipes,
    matchingLaserRecipe,
    laserRecipeThicknessMatches,
    saveLaserRecipes,
} from './laser-recipes';
import { machineProfileById } from '../cutting-parameters/machines';
import { LaserCalibration } from './LaserCalibration';
import { ScanAlignmentFields } from './ScanAlignmentFields';
const input =
    'w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white';
export function LaserSettingsFields({
    operation,
    units,
    options,
    onChange,
    feed,
    power,
    interval,
    setFeed,
    setPower,
    setInterval,
    material,
    thickness,
    machineId,
    stock,
    onReady,
    editing = false,
    overscan,
    setOverscan,
    gamma,
    setGamma,
    nativePixelSize,
    settingsSources = [],
    currentOperationId,
    onSettingsTransfer,
}: {
    settingsSources?: LaserSettingsSource[];
    currentOperationId?: string;
    onSettingsTransfer?: (settings: CopiedLaserSettings) => void;
    operation: string;
    units: UnitSystem;
    options: LaserOptions;
    onChange: Dispatch<SetStateAction<LaserOptions>>;
    feed: number;
    power: number;
    interval: number;
    setFeed: (v: number) => void;
    setPower: (v: number) => void;
    setInterval: (v: number) => void;
    material: string;
    thickness: number;
    machineId: string;
    stock: JobStock;
    onReady: (ready: boolean) => void;
    editing?: boolean;
    overscan: number;
    setOverscan: (v: number) => void;
    nativePixelSize?: { x: number; y: number };
    gamma: number;
    setGamma: (v: number) => void;
}) {
    const [intervalTesting, setIntervalTesting] = useState(false);
    const [focusTesting, setFocusTesting] = useState(false);
    const [anyThickness, setAnyThickness] = useState(false);
    const [recipes, setRecipes] = useState(loadLaserRecipes),
        [laser, setLaser] = useState(
            () => localStorage.getItem('gcam.laserIdentity') ?? '',
        ),
        [manual, setManual] = useState(editing),
        [changing, setChanging] = useState(false),
        [calibrating, setCalibrating] = useState(false),
        [error, setError] = useState(''),
        [fromTest, setFromTest] = useState(false);
    const [family, setFamily] = useState<'diode' | 'co2'>(() =>
        localStorage.getItem('gcam.laserFamily') === 'co2' ? 'co2' : 'diode',
    );
    const [watts, setWatts] = useState(() =>
        Number(localStorage.getItem('gcam.laserWatts') ?? 10),
    );
    const identity = `${family}:${watts}:${laser}`;
    const setupValid =
        Number.isFinite(watts) &&
        watts >= (family === 'diode' ? 1 : 40) &&
        watts <= (family === 'diode' ? 40 : 250);
    const o: Required<LaserOptions> = {
        ...(LASER_DEFAULTS as Required<LaserOptions>),
        ...options,
    };
    const native = operation === 'laser-raster' && o.passThrough;
    const shownInterval =
        native && nativePixelSize
            ? Math.abs(Math.round(o.scanAngle / 90)) % 2
                ? nativePixelSize.x
                : nativePixelSize.y
            : interval;
    const recipe = useMemo(
        () =>
            matchingLaserRecipe(recipes, {
                laser: identity,
                machine: machineId,
                material,
                thickness,
                operation,
                maxFeed: machineProfileById(machineId)?.maxXYFeedMmMin,
            }),
        [recipes, identity, machineId, material, thickness, operation],
    );
    const ready = setupValid && (manual || !!recipe || editing);
    useEffect(() => {
        onReady(ready);
    }, [ready, onReady]);
    useEffect(() => {
        if (!manual && recipe) {
            setFeed(recipe.feed);
            setPower(recipe.power);
            setInterval(recipe.interval);
            if (recipe.overscan !== undefined) setOverscan(recipe.overscan);
            onChange((current) => ({
                ...recipe.options,
                imageCrop: current.imageCrop ?? LASER_DEFAULTS.imageCrop,
                imageMask: current.imageMask ?? [],
                scanAlignment:
                    current.scanAlignment ?? LASER_DEFAULTS.scanAlignment,
            }));
        }
    }, [manual, recipe, setFeed, setPower, setInterval, setOverscan, onChange]);
    const update = (next: LaserOptions) =>
        onChange((current) => ({ ...current, ...next }));
    const save = () => {
        if (!setupValid) {
            setError('Set the optical power within the selected laser range.');
            return;
        }
        const recipeOptions: LaserOptions = { ...o };
        delete recipeOptions.imageCrop;
        delete recipeOptions.imageMask;
        delete recipeOptions.maskSourceIds;
        delete recipeOptions.scanAlignment;
        const next: LaserRecipe[] = [
            ...recipes,
            {
                id: crypto.randomUUID(),
                name: `${material} ${anyThickness && operation !== 'laser-cut' ? 'any thickness' : thickness + ' mm'} · ${operation === 'laser-cut' ? 'Cut' : operation === 'laser-fill' ? 'Fill' : 'Image'}`,
                laser: identity,
                machine: machineId,
                material,
                thickness,
                ...(anyThickness && operation !== 'laser-cut'
                    ? { thicknessIndependent: true }
                    : {}),
                operation,
                feed,
                power,
                interval,
                overscan,
                options: recipeOptions,
                family,
                opticalWatts: watts,
                source: fromTest ? 'User calibrated' : 'User settings',
            },
        ];
        try {
            saveLaserRecipes(next);
            setRecipes(next);
            setManual(anyThickness && operation !== 'laser-cut');
            setChanging(false);
            setError('');
        } catch {
            setError('Could not save laser settings.');
        }
    };
    return (
        <>
            <div className="grid grid-cols-2 gap-2 text-xs">
                <label>
                    Laser type
                    <select
                        aria-label="Laser type"
                        className={input}
                        value={family}
                        onChange={(e) => {
                            const value = e.target.value as 'diode' | 'co2';
                            setFamily(value);
                            localStorage.setItem('gcam.laserFamily', value);
                            const next =
                                value === 'diode'
                                    ? Math.min(40, Math.max(1, watts))
                                    : Math.min(250, Math.max(40, watts));
                            setWatts(next);
                            localStorage.setItem(
                                'gcam.laserWatts',
                                String(next),
                            );
                            setManual(false);
                        }}
                    >
                        <option value="diode">Blue diode (1–40 W)</option>
                        <option value="co2">CO₂ (40–250 W)</option>
                    </select>
                </label>
                <label>
                    Optical power (W)
                    <input
                        aria-label="Laser optical watts"
                        className={input}
                        type="number"
                        min={family === 'diode' ? 1 : 40}
                        max={family === 'diode' ? 40 : 250}
                        value={watts}
                        onChange={(e) => {
                            const value = Number(e.target.value);
                            setWatts(value);
                            localStorage.setItem(
                                'gcam.laserWatts',
                                String(value),
                            );
                            setManual(false);
                        }}
                    />
                </label>
            </div>
            <details className="text-xs">
                <summary className="cursor-pointer">
                    Lens / setup name (optional)
                </summary>
                <input
                    aria-label="Laser identity"
                    value={laser}
                    placeholder="Identify a different lens or setup"
                    className={input}
                    onChange={(e) => {
                        setLaser(e.target.value);
                        localStorage.setItem(
                            'gcam.laserIdentity',
                            e.target.value,
                        );
                        setManual(false);
                    }}
                />
            </details>
            {operation !== 'laser-cut' && (
                <ScanAlignmentFields
                    device={`${machineId}|${identity}`}
                    value={options.scanAlignment}
                    onChange={(scanAlignment) => update({ scanAlignment })}
                    editing={editing}
                    units={units}
                    feed={feed}
                    stock={stock}
                    maxFeed={machineProfileById(machineId)?.maxXYFeedMmMin}
                    overscan={overscan}
                />
            )}
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-robin-900 dark:bg-dark-lighter/40">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                        {manual
                            ? 'Manual laser values'
                            : 'Suggested laser values'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => setChanging(!changing)}
                        >
                            {changing ? 'Done' : 'Change'}
                        </button>
                        {manual && recipe && (
                            <button
                                className="text-xs underline"
                                onClick={() => setManual(false)}
                            >
                                Use suggestions
                            </button>
                        )}
                    </div>
                </div>
                {recipe && !manual ? (
                    <p className="text-[11px] text-slate-500">
                        {recipe.source} · {material} · {thickness} mm
                        {recipe.estimated && (
                            <span className="block">
                                Starting estimate only. Validate with Material
                                test.
                            </span>
                        )}
                    </p>
                ) : !manual && !editing ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        No calibrated settings for this laser and material yet.
                    </p>
                ) : null}
                {(ready || changing) && (
                    <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                        <span>Feed ({feedUnit(units)})</span>
                        {changing ? (
                            <UnitInput
                                className={input}
                                aria-label="Laser feed"
                                kind="feed"
                                units={units}
                                valueMm={feed}
                                minMm={1}
                                onChangeMm={(v) => {
                                    setFeed(v);
                                    setManual(true);
                                    setFromTest(false);
                                }}
                            />
                        ) : (
                            <span className="text-right">
                                {displayFeed(feed, units)}
                            </span>
                        )}
                        <span>Power (%)</span>
                        {changing ? (
                            <input
                                className={input}
                                aria-label="Laser power percent"
                                type="number"
                                min="0"
                                max="100"
                                value={power / 10}
                                onChange={(e) => {
                                    setPower(Number(e.target.value) * 10);
                                    setManual(true);
                                    setFromTest(false);
                                }}
                            />
                        ) : (
                            <span className="text-right">{power / 10}</span>
                        )}
                        <span>Passes</span>
                        {changing ? (
                            <input
                                className={input}
                                aria-label="Laser passes"
                                type="number"
                                min="1"
                                max="100"
                                value={o.passes}
                                onChange={(e) => {
                                    update({ passes: Number(e.target.value) });
                                    setManual(true);
                                    setFromTest(false);
                                }}
                            />
                        ) : (
                            <span className="text-right">{o.passes}</span>
                        )}
                        {operation !== 'laser-cut' && (
                            <>
                                <span>Line interval ({lengthUnit(units)})</span>
                                {changing ? (
                                    <UnitInput
                                        className={input}
                                        aria-label="Laser line interval"
                                        units={units}
                                        valueMm={shownInterval}
                                        disabled={native}
                                        minMm={0.01}
                                        stepMm={0.01}
                                        onChangeMm={(v) => {
                                            setInterval(v);
                                            setManual(true);
                                            setFromTest(false);
                                        }}
                                    />
                                ) : (
                                    <span className="text-right">
                                        {displayValue(shownInterval, units, 5)}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => setCalibrating(!calibrating)}
                    >
                        Material test
                    </button>
                    {operation !== 'laser-cut' && !stock.laserRotary && (
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => setIntervalTesting(true)}
                        >
                            Interval test
                        </button>
                    )}
                    {!stock.laserRotary && (
                        <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            disabled={!setupValid}
                            onClick={() => setFocusTesting(true)}
                        >
                            Focus test
                        </button>
                    )}
                    {(manual || editing) && (
                        <>
                            {operation !== 'laser-cut' && (
                                <label className="flex items-center gap-1 text-xs">
                                    <input
                                        aria-label="Save engraving for any thickness"
                                        type="checkbox"
                                        checked={anyThickness}
                                        onChange={(event) =>
                                            setAnyThickness(
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />
                                    Any thickness
                                </label>
                            )}
                            <button
                                className="rounded border px-2 py-1 text-xs"
                                onClick={save}
                            >
                                Save as suggestion
                            </button>
                        </>
                    )}
                    {!ready && changing && (
                        <button
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => setManual(true)}
                        >
                            Use manual values
                        </button>
                    )}
                </div>
                {error && (
                    <p role="alert" className="text-xs text-red-600">
                        {error}
                    </p>
                )}
            </section>
            {onSettingsTransfer && (
                <LaserSettingsTransfer
                    sources={settingsSources}
                    operation={operation}
                    currentId={currentOperationId}
                    maxFeed={machineProfileById(machineId)?.maxXYFeedMmMin}
                    onApply={(settings) => {
                        onSettingsTransfer(settings);
                        setManual(true);
                        setChanging(true);
                        setFromTest(false);
                    }}
                />
            )}
            <LaserMaterialLibrary
                units={units}
                recipes={recipes}
                canApply={(entry) =>
                    entry.laser === identity &&
                    entry.machine === machineId &&
                    entry.material === material &&
                    laserRecipeThicknessMatches(entry, thickness) &&
                    entry.operation === operation &&
                    entry.feed <=
                        (machineProfileById(machineId)?.maxXYFeedMmMin ??
                            Infinity)
                }
                onApply={(entry) => {
                    setManual(true);
                    setChanging(false);
                    setFeed(entry.feed);
                    setPower(entry.power);
                    setInterval(entry.interval);
                    if (entry.overscan !== undefined)
                        setOverscan(entry.overscan);
                    onChange((current) => ({
                        ...entry.options,
                        imageCrop:
                            current.imageCrop ?? LASER_DEFAULTS.imageCrop,
                        imageMask: current.imageMask ?? [],
                        scanAlignment:
                            current.scanAlignment ??
                            LASER_DEFAULTS.scanAlignment,
                    }));
                }}
                onChange={(next) => {
                    setManual(true);
                    setRecipes(next);
                }}
            />
            {intervalTesting && (
                <LaserIntervalTest
                    key={`${machineId}|${identity}`}
                    device={`${machineId}|${identity}`}
                    stock={stock}
                    units={units}
                    feed={feed}
                    power={power}
                    overscan={overscan}
                    options={options}
                    maxFeed={machineProfileById(machineId)?.maxXYFeedMmMin}
                    onClose={() => setIntervalTesting(false)}
                    onPick={(value, tested) => {
                        setInterval(value);
                        setFeed(tested.feed);
                        setPower(tested.power);
                        setOverscan(tested.overscan);
                        update({
                            passes: 1,
                            dotWidthCorrection: 0,
                            passThrough: false,
                            angleIncrement: 0,
                            scanAngle: 0,
                            fillAngle: 0,
                            crosshatch: false,
                            fillMode: 'hatch',
                        });
                        setManual(true);
                        setFromTest(true);
                        setIntervalTesting(false);
                    }}
                />
            )}
            {focusTesting && !stock.laserRotary && (
                <LaserFocusTest
                    key={`${machineId}|${identity}`}
                    device={`${machineId}|${identity}`}
                    stock={stock}
                    units={units}
                    feed={feed}
                    power={power}
                    options={options}
                    maxFeed={machineProfileById(machineId)?.maxXYFeedMmMin}
                    onClose={() => setFocusTesting(false)}
                />
            )}
            {calibrating && (
                <LaserCalibration
                    key={`${identity}:${material}:${thickness}:${operation}`}
                    reference={recipe}
                    motionLimit={machineProfileById(machineId)?.maxXYFeedMmMin}
                    onClose={() => setCalibrating(false)}
                    stock={stock}
                    units={units}
                    laser={identity}
                    operation={operation}
                    interval={interval}
                    options={o}
                    onPick={(f, p) => {
                        setFeed(f);
                        setPower(p);
                        setManual(true);
                        setChanging(true);
                        setCalibrating(false);
                        setFromTest(true);
                    }}
                />
            )}
            <details
                open={operation === 'laser-raster'}
                className="rounded-lg border border-slate-200 p-2 dark:border-robin-900"
            >
                <summary className="cursor-pointer text-xs">
                    {operation === 'laser-raster'
                        ? 'Image processing'
                        : 'Laser options'}
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <label className="col-span-2">
                        Power control
                        <select
                            aria-label="Laser power control"
                            value={o.powerMode}
                            className={input}
                            onChange={(e) =>
                                update({
                                    powerMode: e.target.value as
                                        | 'profile'
                                        | 'dynamic'
                                        | 'constant',
                                })
                            }
                        >
                            <option value="profile">Controller default</option>
                            <option value="dynamic">
                                Speed-adjusted (Grbl / grblHAL)
                            </option>
                            <option value="constant">
                                Constant (Grbl / grblHAL)
                            </option>
                        </select>
                        {o.powerMode === 'constant' && (
                            <span className="block text-[10px]">
                                Power stays fixed during acceleration and
                                deceleration.
                            </span>
                        )}
                    </label>
                    {operation === 'laser-raster' && (
                        <LaserImagePresets
                            interval={interval}
                            gamma={gamma}
                            options={o}
                            onApply={(preset) => {
                                if (preset.gamma !== undefined)
                                    setGamma(preset.gamma);
                                if (preset.interval !== undefined)
                                    setInterval(preset.interval);
                                update(preset.options);
                            }}
                        />
                    )}
                    {operation === 'laser-cut' && (
                        <>
                            <label>
                                Kerf ({lengthUnit(units)})
                                <UnitInput
                                    units={units}
                                    aria-label="Laser kerf"
                                    valueMm={o.kerf}
                                    stepMm={0.01}
                                    onChangeMm={(v) => update({ kerf: v })}
                                    className={input}
                                />
                                <span className="block text-[10px]">
                                    Positive expands outer cuts; negative
                                    contracts.
                                </span>
                            </label>
                            <label>
                                Overcut ({lengthUnit(units)})
                                <UnitInput
                                    aria-label="Laser overcut"
                                    units={units}
                                    valueMm={o.overcut}
                                    minMm={0}
                                    stepMm={0.1}
                                    className={input}
                                    onChangeMm={(v) => update({ overcut: v })}
                                />
                                <span className="block text-[10px]">
                                    Closed shapes, final pass only.
                                </span>
                            </label>
                            <details className="col-span-2">
                                <summary className="cursor-pointer">
                                    Entry / exit leads
                                </summary>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {(['In', 'Out'] as const).map(
                                        (direction) => (
                                            <label key={direction}>
                                                {direction === 'In'
                                                    ? 'Entry'
                                                    : 'Exit'}{' '}
                                                length ({lengthUnit(units)})
                                                <UnitInput
                                                    aria-label={`Laser lead ${direction.toLowerCase()} length`}
                                                    units={units}
                                                    minMm={0}
                                                    stepMm={0.1}
                                                    valueMm={
                                                        o[
                                                            direction === 'In'
                                                                ? 'leadInLength'
                                                                : 'leadOutLength'
                                                        ]
                                                    }
                                                    className={input}
                                                    onChangeMm={(v) =>
                                                        update(
                                                            direction === 'In'
                                                                ? {
                                                                      leadInLength:
                                                                          v,
                                                                  }
                                                                : {
                                                                      leadOutLength:
                                                                          v,
                                                                  },
                                                        )
                                                    }
                                                />
                                                Angle (°)
                                                <input
                                                    aria-label={`Laser lead ${direction.toLowerCase()} angle`}
                                                    type="number"
                                                    min={-180}
                                                    max={180}
                                                    value={
                                                        o[
                                                            direction === 'In'
                                                                ? 'leadInAngle'
                                                                : 'leadOutAngle'
                                                        ]
                                                    }
                                                    className={input}
                                                    onChange={(e) =>
                                                        update(
                                                            direction === 'In'
                                                                ? {
                                                                      leadInAngle:
                                                                          Number(
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                          ),
                                                                  }
                                                                : {
                                                                      leadOutAngle:
                                                                          Number(
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                          ),
                                                                  },
                                                        )
                                                    }
                                                />
                                            </label>
                                        ),
                                    )}
                                    <span className="col-span-2 text-[10px]">
                                        Zero length disables a lead. Positive
                                        angles use the scrap side of closed
                                        outlines, or the left side of open
                                        paths.
                                    </span>
                                </div>
                            </details>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.innerFirst}
                                    onChange={(e) =>
                                        update({ innerFirst: e.target.checked })
                                    }
                                />
                                Inner shapes first
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.optimizeTravel}
                                    onChange={(e) =>
                                        update({
                                            optimizeTravel: e.target.checked,
                                        })
                                    }
                                />
                                Reduce travel
                            </label>
                            <label className="col-span-2 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    aria-label="Prefer laser corner starts"
                                    checked={o.preferCornerStarts}
                                    onChange={(event) =>
                                        update({
                                            preferCornerStarts:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                                Prefer corner starts
                            </label>
                            <label className="col-span-2">
                                Cut order
                                <select
                                    aria-label="Laser cut order"
                                    title="Order by shape centres; inner cuts remain first when enabled"
                                    className={input}
                                    value={o.cutOrder}
                                    onChange={(event) =>
                                        update({
                                            cutOrder: event.currentTarget
                                                .value as LaserOptions['cutOrder'],
                                        })
                                    }
                                >
                                    <option value="none">Automatic</option>
                                    <option value="left-to-right">
                                        Left to right
                                    </option>
                                    <option value="right-to-left">
                                        Right to left
                                    </option>
                                    <option value="top-to-bottom">
                                        Top to bottom
                                    </option>
                                    <option value="bottom-to-top">
                                        Bottom to top
                                    </option>
                                </select>
                            </label>
                            <label className="col-span-2 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    aria-label="Remove shared cuts"
                                    checked={o.removeSharedCuts}
                                    onChange={(e) =>
                                        update({
                                            removeSharedCuts: e.target.checked,
                                        })
                                    }
                                />
                                Remove shared cuts
                            </label>
                            <span className="col-span-2 text-[10px]">
                                Matching straight segments in this operation
                                only; no gap tolerance.
                            </span>
                            <label className="col-span-2 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.perforation}
                                    onChange={(e) =>
                                        update({
                                            perforation: e.target.checked,
                                        })
                                    }
                                />
                                Perforation
                            </label>
                            {o.perforation && (
                                <>
                                    <label>
                                        Cut length ({lengthUnit(units)})
                                        <UnitInput
                                            aria-label="Perforation cut length"
                                            units={units}
                                            valueMm={o.perforationCut}
                                            minMm={0.001}
                                            stepMm={0.1}
                                            className={input}
                                            onChangeMm={(v) =>
                                                update({ perforationCut: v })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Skip length ({lengthUnit(units)})
                                        <UnitInput
                                            aria-label="Perforation skip length"
                                            units={units}
                                            valueMm={o.perforationSkip}
                                            minMm={0.001}
                                            stepMm={0.1}
                                            className={input}
                                            onChangeMm={(v) =>
                                                update({ perforationSkip: v })
                                            }
                                        />
                                    </label>
                                </>
                            )}
                            <label className="col-span-2 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.bridges}
                                    onChange={(e) =>
                                        update({ bridges: e.target.checked })
                                    }
                                />
                                Holding bridges
                            </label>
                            <label>
                                Bridge width ({lengthUnit(units)})
                                <UnitInput
                                    aria-label="Laser bridge width"
                                    units={units}
                                    valueMm={o.bridgeWidth}
                                    minMm={0.001}
                                    stepMm={0.1}
                                    className={input}
                                    onChangeMm={(v) =>
                                        update({ bridgeWidth: v })
                                    }
                                />
                            </label>
                            {o.bridges && (
                                <label>
                                    Bridge power (% of cutting power)
                                    <input
                                        type="number"
                                        aria-label="Laser bridge power percent"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={
                                            Math.round(o.bridgePower * 10000) /
                                            100
                                        }
                                        className={input}
                                        onChange={(event) =>
                                            update({
                                                bridgePower:
                                                    Number(event.target.value) /
                                                    100,
                                            })
                                        }
                                    />
                                    <span className="text-[11px] text-slate-500">
                                        0% switches the beam off.
                                    </span>
                                </label>
                            )}
                            {o.bridges && (
                                <label>
                                    Bridge generation
                                    <select
                                        aria-label="Bridge generation"
                                        value={o.bridgeMode}
                                        className={input}
                                        onChange={(e) =>
                                            update({
                                                bridgeMode: e.target.value as
                                                    | 'automatic'
                                                    | 'manual',
                                            })
                                        }
                                    >
                                        <option value="manual">Manual</option>
                                        <option value="automatic">
                                            Automatic
                                        </option>
                                    </select>
                                </label>
                            )}
                            {o.bridges && o.bridgeMode === 'automatic' && (
                                <>
                                    <label className="col-span-2">
                                        Bridge placement
                                        <select
                                            aria-label="Bridge placement"
                                            value={o.bridgePlacement}
                                            className={input}
                                            onChange={(e) =>
                                                update({
                                                    bridgePlacement: e.target
                                                        .value as
                                                        | 'count'
                                                        | 'spacing',
                                                })
                                            }
                                        >
                                            <option value="count">
                                                Count per shape
                                            </option>
                                            <option value="spacing">
                                                Target spacing
                                            </option>
                                        </select>
                                    </label>
                                    {o.bridgePlacement === 'count' ? (
                                        <label>
                                            Bridges per shape
                                            <input
                                                aria-label="Bridges per shape"
                                                type="number"
                                                min={1}
                                                max={100}
                                                step={1}
                                                value={o.bridgeCount}
                                                className={input}
                                                onChange={(e) =>
                                                    update({
                                                        bridgeCount: Number(
                                                            e.target.value,
                                                        ),
                                                    })
                                                }
                                            />
                                        </label>
                                    ) : (
                                        <label>
                                            Target spacing ({lengthUnit(units)})
                                            <UnitInput
                                                aria-label="Laser bridge spacing"
                                                units={units}
                                                valueMm={o.bridgeSpacing}
                                                minMm={0.01}
                                                stepMm={1}
                                                className={input}
                                                onChangeMm={(v) =>
                                                    update({ bridgeSpacing: v })
                                                }
                                            />
                                        </label>
                                    )}
                                    {o.bridgePlacement === 'spacing' && (
                                        <>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={o.bridgeLimit}
                                                    onChange={(e) =>
                                                        update({
                                                            bridgeLimit:
                                                                e.target
                                                                    .checked,
                                                        })
                                                    }
                                                />
                                                Limit maximum
                                            </label>
                                            {o.bridgeLimit && (
                                                <label>
                                                    Maximum bridges
                                                    <input
                                                        aria-label="Maximum laser bridges"
                                                        type="number"
                                                        min={1}
                                                        max={10000}
                                                        step={1}
                                                        value={o.bridgeMax}
                                                        className={input}
                                                        onChange={(e) =>
                                                            update({
                                                                bridgeMax:
                                                                    Number(
                                                                        e.target
                                                                            .value,
                                                                    ),
                                                            })
                                                        }
                                                    />
                                                </label>
                                            )}
                                            <span className="col-span-2 text-[10px]">
                                                Evenly spaced around each
                                                outline. Limiting the count can
                                                increase spacing.
                                            </span>
                                        </>
                                    )}
                                    <label className="col-span-2 flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={o.bridgeSkipInner}
                                            onChange={(e) =>
                                                update({
                                                    bridgeSkipInner:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        Skip inner shapes
                                    </label>
                                </>
                            )}
                        </>
                    )}
                    {operation === 'laser-fill' && (
                        <>
                            {o.fillMode === 'hatch' && (
                                <>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={o.hatchOverscan}
                                            onChange={(e) =>
                                                update({
                                                    hatchOverscan:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        Unpowered overscan
                                    </label>
                                    <label>
                                        Overscan ({lengthUnit(units)})
                                        <UnitInput
                                            aria-label="Hatch overscan"
                                            units={units}
                                            valueMm={overscan}
                                            minMm={0}
                                            stepMm={0.1}
                                            disabled={!o.hatchOverscan}
                                            className={input}
                                            onChangeMm={setOverscan}
                                        />
                                    </label>
                                </>
                            )}
                            <label className="col-span-2">
                                Fill sequence
                                <select
                                    aria-label="Laser fill sequence"
                                    className={input}
                                    value={o.fillSequence}
                                    onChange={(e) =>
                                        update({
                                            fillSequence: e.target.value as
                                                | 'all'
                                                | 'groups'
                                                | 'individual',
                                        })
                                    }
                                >
                                    <option value="all">
                                        All shapes together
                                    </option>
                                    <option value="individual">
                                        Each filled shape separately
                                    </option>
                                    <option value="groups">
                                        Artwork groups together
                                    </option>
                                </select>
                            </label>
                            <label>
                                Fill mode
                                <select
                                    className={input}
                                    value={o.fillMode}
                                    onChange={(e) =>
                                        update({
                                            fillMode: e.target.value as
                                                | 'hatch'
                                                | 'offset',
                                        })
                                    }
                                >
                                    <option value="hatch">Hatch</option>
                                    <option value="offset">Offset fill</option>
                                </select>
                            </label>
                            <label>
                                Scan angle (°)
                                <input
                                    className={input}
                                    type="number"
                                    value={o.fillAngle}
                                    onChange={(e) =>
                                        update({
                                            fillAngle: Number(e.target.value),
                                        })
                                    }
                                />
                            </label>
                            {o.fillMode === 'hatch' && (
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={o.crosshatch}
                                        onChange={(e) =>
                                            update({
                                                crosshatch: e.target.checked,
                                            })
                                        }
                                    />
                                    Crosshatch
                                </label>
                            )}
                        </>
                    )}
                    {(operation === 'laser-raster' ||
                        (operation === 'laser-fill' &&
                            o.fillMode === 'hatch')) && (
                        <label>
                            Angle per pass (°)
                            <input
                                aria-label="Laser angle per pass"
                                step={native ? 90 : 1}
                                className={input}
                                type="number"
                                min={-360}
                                max={360}
                                value={o.angleIncrement}
                                onChange={(e) =>
                                    update({
                                        angleIncrement: Number(e.target.value),
                                    })
                                }
                            />
                        </label>
                    )}
                    {operation === 'laser-raster' && (
                        <>
                            <label className="col-span-2 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.passThrough}
                                    onChange={(e) =>
                                        update({
                                            passThrough: e.target.checked,
                                        })
                                    }
                                />
                                Pixel pass-through
                            </label>
                            {native && (
                                <p className="col-span-2 text-slate-500">
                                    One dot per source pixel. Crops snap to
                                    pixels; scan angles use 90° steps.
                                    {nativePixelSize &&
                                        ` ${(25.4 / nativePixelSize.x).toFixed(1)} × ${(25.4 / nativePixelSize.y).toFixed(1)} DPI.`}
                                </p>
                            )}
                            <LaserImageAdjustments
                                options={options}
                                update={update}
                                units={units}
                            />
                            <label>
                                Dot-width correction ({lengthUnit(units)})
                                <UnitInput
                                    aria-label="Dot-width correction"
                                    className={input}
                                    units={units}
                                    minMm={0}
                                    stepMm={0.01}
                                    valueMm={o.dotWidthCorrection}
                                    onChangeMm={(value) =>
                                        update({ dotWidthCorrection: value })
                                    }
                                />
                            </label>
                        </>
                    )}
                    {operation === 'laser-raster' && (
                        <>
                            <label>
                                Scan angle (°)
                                <input
                                    aria-label="Raster scan angle"
                                    step={native ? 90 : 1}
                                    type="number"
                                    min="-360"
                                    max="360"
                                    className={input}
                                    value={o.scanAngle}
                                    onChange={(e) =>
                                        update({
                                            scanAngle: Number(e.target.value),
                                        })
                                    }
                                />
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={o.trimBlank}
                                    onChange={(e) =>
                                        update({ trimBlank: e.target.checked })
                                    }
                                />
                                Skip blank row ends
                            </label>
                        </>
                    )}
                    {operation !== 'laser-cut' && (
                        <label>
                            <input
                                type="checkbox"
                                checked={o.bidirectional}
                                onChange={(e) =>
                                    update({ bidirectional: e.target.checked })
                                }
                            />{' '}
                            Bidirectional scanning
                        </label>
                    )}
                    <label>
                        <input
                            type="checkbox"
                            checked={o.airAssist}
                            onChange={(e) =>
                                update({ airAssist: e.target.checked })
                            }
                        />{' '}
                        Air assist
                    </label>
                </div>
            </details>
        </>
    );
}
