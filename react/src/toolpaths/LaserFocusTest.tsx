import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
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
import {
    buildFocusTest,
    focusTestDefaults,
    type FocusTestSettings,
} from './focus-test';
import {
    loadFocusTest,
    saveFocusTest,
    type FocusTestState,
} from './focus-test-state';
import { useProgramExport } from '../gcode/useProgramExport';
import { loadOutput, outputError } from '../gcode/profiles';
import { downloadGcode } from './exportGcode';
import { LaserRasterPreview } from './LaserRasterPreview';

const input =
    'w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-robin-900';
export function LaserFocusTest({
    device,
    stock,
    units,
    feed,
    power,
    options,
    maxFeed,
    onClose,
}: {
    device: string;
    stock: JobStock;
    units: UnitSystem;
    feed: number;
    power: number;
    options: LaserOptions;
    maxFeed?: number;
    onClose(): void;
}) {
    const [state, setState] = useState(() =>
        loadFocusTest(device, focusTestDefaults(feed, power)),
    );
    const [output] = useState(loadOutput);
    const [selected, setSelected] = useState<number | null>(null);
    const [status, setStatus] = useState('');
    const s = state.settings;
    const built = useMemo(() => {
        try {
            return {
                result: buildFocusTest(s, stock, units, options, maxFeed),
                error: '',
            };
        } catch (error) {
            return { result: null, error: outputError(error) };
        }
    }, [s, stock, units, options, maxFeed]);
    const paths = useMemo(
        () => (built.result ? [built.result.path] : []),
        [built],
    );
    const program = useProgramExport(
        paths,
        'laser-focus-test',
        false,
        units,
        output,
    );
    const update = (patch: Partial<FocusTestSettings>) => {
        setState((current) => ({
            ...current,
            settings: { ...current.settings, ...patch },
        }));
        setSelected(null);
        setStatus('');
    };
    const field = (
        label: string,
        key: keyof FocusTestSettings,
        kind: 'length' | 'feed' = 'length',
        min?: number,
    ) => (
        <label>
            {label} ({kind === 'feed' ? feedUnit(units) : lengthUnit(units)})
            <UnitInput
                aria-label={label}
                className={input}
                units={units}
                kind={kind}
                valueMm={Number(s[key])}
                minMm={min}
                stepMm="any"
                decimals={kind === 'feed' ? 2 : 4}
                onChangeMm={(value) => update({ [key]: value })}
            />
        </label>
    );
    const save = (next: FocusTestState) => {
        try {
            saveFocusTest(device, next);
            setState(next);
            return true;
        } catch (error) {
            setStatus(outputError(error));
            return false;
        }
    };
    const ready =
        !!program.gcode &&
        !program.gcodeBusy &&
        !built.error &&
        !program.gcodeError;
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Focus test"
                label="Laser focus test"
                closeLabel="Close focus test"
                placement="right"
                onClose={onClose}
                className="pointer-events-auto w-[520px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="col-span-2">
                            Test method
                            <select
                                aria-label="Focus test method"
                                className={input}
                                value={s.mode}
                                onChange={(event) =>
                                    update({
                                        mode: event.target.value as
                                            | 'ramp'
                                            | 'sweep',
                                    })
                                }
                            >
                                <option value="ramp">
                                    Manual ramp — fixed head
                                </option>
                                <option value="sweep">Motorized Z sweep</option>
                            </select>
                        </label>
                        {field('Test line length', 'lengthMm', 'length', 20)}
                        <label>
                            Samples
                            <input
                                aria-label="Focus samples"
                                className={input}
                                type="number"
                                min={2}
                                max={21}
                                value={s.samples}
                                onChange={(event) =>
                                    update({
                                        samples:
                                            event.currentTarget.valueAsNumber,
                                    })
                                }
                            />
                        </label>
                        {s.mode === 'ramp' ? (
                            <>
                                {field(
                                    'Gap at left end',
                                    'leftGapMm',
                                    'length',
                                    0.01,
                                )}
                                {field(
                                    'Gap at right end',
                                    'rightGapMm',
                                    'length',
                                    0.01,
                                )}
                            </>
                        ) : (
                            <>
                                {field('Start work Z', 'startZMm')}
                                {field('End work Z', 'endZMm')}
                            </>
                        )}
                    </div>
                    {s.mode === 'ramp' ? (
                        <p>
                            Use a sloped test piece under the fixed head.
                            Measure both end gaps from the same point on the
                            head.
                        </p>
                    ) : (
                        <details
                            open
                            className="rounded border p-2"
                            aria-label="Focus Z setup"
                        >
                            <summary className="cursor-pointer font-medium">
                                Z axis setup
                            </summary>
                            <label className="my-2 flex items-center gap-2">
                                <input
                                    aria-label="Motorized Z enabled"
                                    type="checkbox"
                                    checked={s.controlledZ}
                                    onChange={(event) =>
                                        update({
                                            controlledZ:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                                This setup has a controlled Z axis
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {field('Minimum work Z', 'minZMm')}
                                {field('Maximum work Z', 'maxZMm')}
                                {field('Travel and return Z', 'travelZMm')}
                                {field(
                                    'Z travel feed',
                                    'zFeedMmMin',
                                    'feed',
                                    1,
                                )}
                                <label className="col-span-2">
                                    Direction away from material
                                    <select
                                        aria-label="Focus clearance direction"
                                        className={input}
                                        value={s.clearanceDirection}
                                        onChange={(event) =>
                                            update({
                                                clearanceDirection: Number(
                                                    event.target.value,
                                                ) as 1 | -1,
                                            })
                                        }
                                    >
                                        <option value={1}>Positive Z</option>
                                        <option value={-1}>Negative Z</option>
                                    </select>
                                </label>
                            </div>
                            <p className="mt-2">
                                Work Z is relative to the zero you set in the
                                sender. Labels use the midpoint Z.
                            </p>
                        </details>
                    )}
                    <details className="rounded border p-2">
                        <summary className="cursor-pointer">
                            Marking settings · {displayFeed(s.feed, units)}{' '}
                            {feedUnit(units)} · {s.power / 10}%
                        </summary>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            {field('Focus feed', 'feed', 'feed', 1)}
                            {(['power', 'labelPower'] as const).map((key) => (
                                <label key={key}>
                                    {key === 'power'
                                        ? 'Line power'
                                        : 'Label power'}{' '}
                                    (%)
                                    <input
                                        aria-label={
                                            key === 'power'
                                                ? 'Focus line power'
                                                : 'Focus label power'
                                        }
                                        className={input}
                                        type="number"
                                        min={0.1}
                                        max={100}
                                        step={0.1}
                                        value={s[key] / 10}
                                        onChange={(event) =>
                                            update({
                                                [key]:
                                                    event.currentTarget
                                                        .valueAsNumber * 10,
                                            })
                                        }
                                    />
                                </label>
                            ))}
                        </div>
                        <label className="mt-2 flex items-center gap-2">
                            <input
                                aria-label="Perforate focus labels"
                                type="checkbox"
                                checked={s.labelPerforation ?? false}
                                onChange={(event) =>
                                    update({
                                        labelPerforation:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                            Perforate labels
                        </label>
                        {s.labelPerforation && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                {field(
                                    'Label cut length',
                                    'labelCutMm',
                                    'length',
                                    0.001,
                                )}
                                {field(
                                    'Label skip length',
                                    'labelSkipMm',
                                    'length',
                                    0.001,
                                )}
                            </div>
                        )}
                        <p className="mt-2">
                            Use just enough power to mark the surface.
                        </p>
                    </details>
                    {built.result && (
                        <LaserRasterPreview
                            contours={built.result.path.previewContours}
                            frame={built.result.frame}
                            interval={0.1}
                            maxPower={Math.max(s.power, s.labelPower)}
                            caption="Focus test layout · relative power"
                        />
                    )}
                    {built.result && (
                        <fieldset className="space-y-2">
                            <legend>Pick the thinnest line or ramp mark</legend>
                            <div className="grid grid-cols-3 gap-1">
                                {built.result.samples.map((sample) => (
                                    <label
                                        key={sample.index}
                                        className="flex items-center gap-1 rounded border px-2 py-1"
                                    >
                                        <input
                                            type="radio"
                                            name="focus-result"
                                            aria-label={
                                                'Focus sample ' + sample.index
                                            }
                                            checked={selected === sample.index}
                                            onChange={() =>
                                                setSelected(sample.index)
                                            }
                                        />
                                        {sample.index}:{' '}
                                        {displayValue(sample.valueMm, units, 4)}{' '}
                                        {lengthUnit(units)}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={!ready}
                            className="rounded border px-3 py-2 disabled:opacity-40"
                            onClick={() => {
                                if (save(state))
                                    setStatus('Focus settings saved.');
                            }}
                        >
                            Save settings
                        </button>
                        <button
                            type="button"
                            disabled={!ready}
                            className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                            onClick={() => {
                                if (save(state))
                                    try {
                                        downloadGcode(
                                            program.gcode,
                                            'laser-focus-test',
                                            output.extension,
                                        );
                                    } catch (error) {
                                        setStatus(outputError(error));
                                    }
                            }}
                        >
                            {program.gcodeBusy
                                ? 'Preparing…'
                                : 'Download focus test'}
                        </button>
                        <button
                            type="button"
                            disabled={!ready || selected === null}
                            className="rounded border px-3 py-2 disabled:opacity-40"
                            onClick={() => {
                                const sample = built.result?.samples.find(
                                    (sample) => sample.index === selected,
                                );
                                if (!sample) return;
                                const next: FocusTestState = {
                                    settings: s,
                                    lastResult: {
                                        mode: s.mode,
                                        index: sample.index,
                                        valueMm: sample.valueMm,
                                        recordedAt: new Date().toISOString(),
                                        settings: { ...s },
                                        stock: {
                                            widthMm: stock.widthMm,
                                            heightMm: stock.heightMm,
                                            thicknessMm: stock.thicknessMm,
                                            origin:
                                                stock.origin ?? 'front-left',
                                        },
                                    },
                                };
                                if (save(next))
                                    setStatus(
                                        'Recorded for this laser/lens setup.',
                                    );
                            }}
                        >
                            Record result
                        </button>
                    </div>
                    {state.lastResult && (
                        <p aria-label="Recorded focus result">
                            Recorded{' '}
                            {state.lastResult.mode === 'ramp'
                                ? 'head gap'
                                : 'work Z'}
                            : {displayValue(state.lastResult.valueMm, units, 4)}{' '}
                            {lengthUnit(units)}
                            {state.lastResult.mode === 'sweep'
                                ? ' · for that work zero'
                                : ''}
                        </p>
                    )}
                    {(built.error || program.gcodeError || status) && (
                        <p
                            role={
                                built.error || program.gcodeError
                                    ? 'alert'
                                    : 'status'
                            }
                        >
                            {built.error || program.gcodeError || status}
                        </p>
                    )}
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
