import { useEffect, useRef, useState } from 'react';
import { UnitInput } from '../components/UnitInput';
import {
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';
import {
    DEFAULT_SCAN_ALIGNMENT,
    scanAlignmentOffset,
} from '../cam/scan-alignment.js';
import {
    buildScanAlignmentTest,
    loadScanAlignment,
    saveScanAlignment,
    type ScanAlignment,
} from './scan-alignment';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { loadOutput, outputError } from '../gcode/profiles';
import { downloadGcode } from './exportGcode';
import type { JobStock } from '../job/stock';

const input =
    'w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-robin-900 dark:bg-dark';
const button =
    'rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-robin-900';
export function ScanAlignmentFields({
    device,
    value,
    onChange,
    editing,
    units,
    feed,
    stock,
    maxFeed,
    overscan,
}: {
    device: string;
    value?: ScanAlignment;
    onChange(value: ScanAlignment): void;
    editing: boolean;
    units: UnitSystem;
    feed: number;
    stock: JobStock;
    maxFeed?: number;
    overscan: number;
}) {
    const [error, setError] = useState('');
    const [testPower, setTestPower] = useState(5);
    const [testOverscan, setTestOverscan] = useState(Math.max(2.5, overscan));
    const invalidShape =
        value !== undefined &&
        (!value ||
            typeof value.enabled !== 'boolean' ||
            !Array.isArray(value.measurements) ||
            value.measurements.length > 24 ||
            value.measurements.some(
                (p) =>
                    !p || !Number.isFinite(p.feed) || !Number.isFinite(p.gap),
            ));
    const current = invalidShape
        ? DEFAULT_SCAN_ALIGNMENT
        : (value ?? DEFAULT_SCAN_ALIGNMENT);
    const latest = useRef({ value, editing, onChange, overscan });
    latest.current = { value, editing, onChange, overscan };
    const mounted = useRef(false);
    const previousDevice = useRef(device);
    useEffect(() => {
        const state = latest.current;
        const changed = previousDevice.current !== device;
        previousDevice.current = device;
        const first = !mounted.current;
        mounted.current = true;
        if (!changed && (!first || state.editing || state.value)) return;
        if (changed) {
            setError('');
            setTestPower(5);
            setTestOverscan(Math.max(2.5, state.overscan));
        }
        state.onChange(loadScanAlignment(device) ?? DEFAULT_SCAN_ALIGNMENT);
    }, [device]);
    let calibrationError = '';
    try {
        scanAlignmentOffset(current, feed);
    } catch (e) {
        calibrationError = outputError(e);
    }
    const update = (next: Partial<ScanAlignment>) => {
        setError('');
        onChange({ ...current, ...next });
    };
    const changeRow = (
        index: number,
        next: Partial<{ feed: number; gap: number }>,
    ) =>
        update({
            measurements: current.measurements.map((p, i) =>
                i === index ? { ...p, ...next } : p,
            ),
        });
    if (invalidShape)
        return (
            <details className="rounded border border-slate-200 p-2 dark:border-robin-900">
                <summary>Scan alignment</summary>
                <p role="alert">Invalid scan alignment settings.</p>
                <button
                    type="button"
                    className={button}
                    onClick={() => onChange(DEFAULT_SCAN_ALIGNMENT)}
                >
                    Reset scan alignment
                </button>
            </details>
        );
    return (
        <details className="rounded border border-slate-200 p-2 dark:border-robin-900">
            <summary className="cursor-pointer text-xs font-medium">
                Scan alignment
            </summary>
            <div className="mt-2 space-y-2 text-xs">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={current.enabled}
                        onChange={(e) => update({ enabled: e.target.checked })}
                    />
                    Enable measured scan alignment
                </label>
                <p className="text-slate-500">
                    Bidirectional image/hatch scans. Positive gaps advance
                    firing against travel; each row shifts by half. Test output
                    has correction off.
                </p>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <span>Speed ({feedUnit(units)})</span>
                    <span>Measured gap ({lengthUnit(units)})</span>
                    <span />
                    {current.measurements.map((p, i) => (
                        <div className="contents" key={i}>
                            <UnitInput
                                aria-label={`Alignment speed ${i + 1}`}
                                units={units}
                                kind="feed"
                                valueMm={p.feed}
                                minMm={0.01}
                                stepMm={100}
                                className={input}
                                onChangeMm={(feed) => changeRow(i, { feed })}
                            />
                            <div>
                                <UnitInput
                                    aria-label={`Alignment gap ${i + 1}`}
                                    units={units}
                                    valueMm={p.gap}
                                    minMm={-20}
                                    maxMm={20}
                                    stepMm={0.01}
                                    decimals={4}
                                    className={input}
                                    onChangeMm={(gap) => changeRow(i, { gap })}
                                />
                                <span className="text-slate-500">
                                    {displayValue(p.gap / 2, units, 4).toFixed(
                                        4,
                                    )}{' '}
                                    per row
                                </span>
                            </div>
                            <button
                                type="button"
                                aria-label={`Remove alignment speed ${i + 1}`}
                                className={button}
                                onClick={() =>
                                    update({
                                        measurements:
                                            current.measurements.filter(
                                                (_, n) => n !== i,
                                            ),
                                    })
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1">
                    <button
                        type="button"
                        className={button}
                        disabled={current.measurements.length >= 24}
                        onClick={() =>
                            update({
                                measurements: [
                                    ...current.measurements,
                                    {
                                        feed: Math.max(
                                            0.01,
                                            Math.round(
                                                (Math.min(
                                                    feed,
                                                    maxFeed ?? feed,
                                                ) /
                                                    (1 +
                                                        current.measurements
                                                            .length *
                                                            0.25)) *
                                                    100,
                                            ) / 100,
                                        ),
                                        gap: 0,
                                    },
                                ],
                            })
                        }
                    >
                        Add speed
                    </button>
                    <button
                        type="button"
                        className={button}
                        onClick={() => {
                            try {
                                saveScanAlignment(device, current);
                                setError('Saved for this laser setup.');
                            } catch (e) {
                                setError(outputError(e));
                            }
                        }}
                    >
                        Save for laser
                    </button>
                    <button
                        type="button"
                        className={button}
                        onClick={() =>
                            onChange(
                                loadScanAlignment(device) ??
                                    DEFAULT_SCAN_ALIGNMENT,
                            )
                        }
                    >
                        Load saved
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <label>
                        Test power (%)
                        <input
                            aria-label="Alignment test power"
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            className={input}
                            value={testPower}
                            onChange={(e) =>
                                setTestPower(Number(e.target.value))
                            }
                        />
                    </label>
                    <label>
                        Test overscan ({lengthUnit(units)})
                        <UnitInput
                            aria-label="Alignment test overscan"
                            units={units}
                            valueMm={testOverscan}
                            minMm={2.5}
                            stepMm={0.1}
                            className={input}
                            onChangeMm={setTestOverscan}
                        />
                    </label>
                </div>
                <p className="text-slate-500">
                    Set power for a visible mark and enough overscan to reach
                    test speed. Test rows run from slowest at the bottom to
                    fastest at the top.
                </p>
                <button
                    type="button"
                    className={button}
                    onClick={() => {
                        try {
                            const path = buildScanAlignmentTest({
                                feeds: current.measurements.map((p) => p.feed),
                                power: testPower * 10,
                                overscan: testOverscan,
                                stock,
                                maxFeed,
                            });
                            const settings = loadOutput();
                            downloadGcode(
                                exportToolpaths(
                                    [path],
                                    'scan-alignment-test',
                                    false,
                                    units,
                                    settings,
                                ),
                                'scan-alignment-test',
                                settings.extension,
                            );
                            setError(
                                'Test uses at least 2.5 mm overscan; measure gaps before enabling correction.',
                            );
                        } catch (e) {
                            setError(outputError(e));
                        }
                    }}
                >
                    Download alignment test
                </button>
                {(error || calibrationError) && (
                    <p role="status">{error || calibrationError}</p>
                )}
            </div>
        </details>
    );
}
