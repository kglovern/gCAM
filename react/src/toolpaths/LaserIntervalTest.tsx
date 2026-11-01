import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
import { UnitInput } from '../components/UnitInput';
import type { JobStock } from '../job/stock';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import { useProgramExport } from '../gcode/useProgramExport';
import { loadOutput, outputError } from '../gcode/profiles';
import { downloadGcode } from './exportGcode';
import { LaserRasterPreview } from './LaserRasterPreview';
import { buildIntervalTest, type IntervalTestSettings } from './interval-test';
import type { LaserOptions } from './toolpathRequest';
import {
    loadIntervalTest,
    saveIntervalTest,
    type IntervalTestState,
} from './interval-test-state';

const input = 'w-full rounded border bg-transparent px-2 py-1';
export function LaserIntervalTest({
    device,
    stock,
    units,
    feed,
    power,
    overscan,
    options,
    maxFeed,
    onPick,
    onClose,
}: {
    device: string;
    stock: JobStock;
    units: UnitSystem;
    feed: number;
    power: number;
    overscan: number;
    options: LaserOptions;
    maxFeed?: number;
    onPick(interval: number, settings: IntervalTestSettings): void;
    onClose(): void;
}) {
    const [state, setState] = useState(() =>
        loadIntervalTest(device, {
            min: 0.08,
            max: 0.16,
            steps: 5,
            size: 10,
            feed,
            power,
            labelPower: 50,
            overscan,
            pattern: 'solid',
        }),
    );
    const settings = state.settings;
    const save = (next: IntervalTestState) => {
        try {
            saveIntervalTest(device, next);
            setState(next);
            return true;
        } catch (error) {
            setStatus(outputError(error));
            return false;
        }
    };
    const [status, setStatus] = useState('');
    const [output] = useState(loadOutput);
    const built = useMemo(() => {
        try {
            if (output.decimals < 3)
                throw new Error(
                    'Interval calibration requires at least 3 coordinate decimals in Config → G-code.',
                );
            return {
                result: buildIntervalTest(settings, stock, options, maxFeed),
                error: '',
            };
        } catch (e) {
            return { result: null, error: outputError(e) };
        }
    }, [settings, stock, options, maxFeed, output.decimals]);
    const paths = useMemo(
        () => (built.result ? [built.result.path] : []),
        [built],
    );
    const program = useProgramExport(
        paths,
        'laser-interval-test',
        false,
        'metric',
        output,
    );
    const update = (value: Partial<IntervalTestSettings>) => {
        setStatus('');
        setState((current) => ({
            ...current,
            settings: { ...current.settings, ...value },
        }));
    };
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Interval test"
                label="Laser interval test"
                closeLabel="Close interval test"
                onClose={onClose}
                placement="right"
                className="pointer-events-auto w-[520px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                ['Minimum interval', 'min'],
                                ['Maximum interval', 'max'],
                                ['Sample size', 'size'],
                                ['Test overscan', 'overscan'],
                            ] as const
                        ).map(([label, key]) => (
                            <label key={key}>
                                {label} ({lengthUnit(units)})
                                <UnitInput
                                    className={input}
                                    aria-label={label}
                                    units={units}
                                    valueMm={settings[key]}
                                    stepMm={0.01}
                                    minMm={0}
                                    onChangeMm={(value) =>
                                        update({ [key]: value })
                                    }
                                />
                            </label>
                        ))}
                        <label>
                            Samples
                            <input
                                aria-label="Interval samples"
                                className={input}
                                type="number"
                                min={2}
                                max={12}
                                value={settings.steps}
                                onChange={(e) =>
                                    update({ steps: Number(e.target.value) })
                                }
                            />
                        </label>
                        <label>
                            Pattern
                            <select
                                aria-label="Interval pattern"
                                className={input}
                                value={settings.pattern}
                                onChange={(e) =>
                                    update({
                                        pattern: e.target.value as
                                            | 'solid'
                                            | 'dither',
                                    })
                                }
                            >
                                <option value="solid">Solid fill</option>
                                <option value="dither">
                                    Dithered gradient
                                </option>
                            </select>
                        </label>
                        <label>
                            Feed
                            <UnitInput
                                aria-label="Interval test feed"
                                className={input}
                                units={units}
                                kind="feed"
                                valueMm={settings.feed}
                                minMm={1}
                                onChangeMm={(value) => update({ feed: value })}
                            />
                        </label>
                        {(
                            [
                                ['Sample power (%)', 'power'],
                                ['Label power (%)', 'labelPower'],
                            ] as const
                        ).map(([label, key]) => (
                            <label key={key}>
                                {label}
                                <input
                                    aria-label={label}
                                    className={input}
                                    type="number"
                                    min={0.1}
                                    max={100}
                                    value={settings[key] / 10}
                                    onChange={(e) =>
                                        update({
                                            [key]: Number(e.target.value) * 10,
                                        })
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    {built.result && (
                        <LaserRasterPreview
                            contours={built.result.path.previewContours}
                            frame={built.result.frame}
                            interval={settings.min}
                            maxPower={Math.max(
                                settings.power,
                                settings.labelPower,
                            )}
                        />
                    )}
                    <p>
                        Labels and exported coordinates use mm. Pick the
                        physical sample whose lines touch without overlapping.
                    </p>
                    <button
                        type="button"
                        className="mr-2 rounded border px-3 py-2 disabled:opacity-40"
                        disabled={
                            !built.result ||
                            program.gcodeBusy ||
                            !!program.gcodeError
                        }
                        onClick={() => {
                            if (save(state))
                                setStatus('Interval settings saved.');
                        }}
                    >
                        Save settings
                    </button>
                    <button
                        type="button"
                        className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                        disabled={
                            !program.gcode || program.gcodeBusy || !!built.error
                        }
                        onClick={() => {
                            try {
                                if (!save(state)) return;
                                downloadGcode(
                                    program.gcode,
                                    'laser-interval-test',
                                    output.extension,
                                );
                            } catch (e) {
                                setStatus(outputError(e));
                            }
                        }}
                    >
                        {program.gcodeBusy
                            ? 'Preparing…'
                            : 'Download interval test'}
                    </button>
                    <div
                        aria-label="Interval test results"
                        className="flex flex-wrap gap-2"
                    >
                        {built.result?.samples.map((sample, i) => (
                            <button
                                type="button"
                                key={i}
                                className="rounded border px-2 py-1"
                                disabled={
                                    !program.gcode ||
                                    program.gcodeBusy ||
                                    !!program.gcodeError
                                }
                                onClick={() => {
                                    if (
                                        !save({
                                            settings,
                                            lastResult: {
                                                intervalMm: sample.interval,
                                                settings: { ...settings },
                                                material:
                                                    stock.laserMaterial ??
                                                    stock.material,
                                                thicknessMm: stock.thicknessMm,
                                                recordedAt:
                                                    new Date().toISOString(),
                                            },
                                        })
                                    )
                                        return;
                                    onPick(sample.interval, settings);
                                }}
                            >
                                {displayValue(sample.interval, units)}{' '}
                                {lengthUnit(units)}
                            </button>
                        ))}
                    </div>
                    {state.lastResult && (
                        <p aria-label="Recorded interval result">
                            Last selection:{' '}
                            {displayValue(state.lastResult.intervalMm, units)}{' '}
                            {lengthUnit(units)} · {state.lastResult.material} ·{' '}
                            {displayValue(state.lastResult.thicknessMm, units)}{' '}
                            {lengthUnit(units)}
                        </p>
                    )}
                    {(built.error || program.gcodeError || status) && (
                        <p role="alert">
                            {built.error || program.gcodeError || status}
                        </p>
                    )}
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
