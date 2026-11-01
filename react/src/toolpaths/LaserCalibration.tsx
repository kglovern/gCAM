import { laserCalibrationRange } from './laser-recipes';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
import { useState } from 'react';
import { buildToolpathGcode } from '../lib/engine';
import type { LaserOptions } from './toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { loadOutput, outputError } from '../gcode/profiles';
import { downloadGcode } from './exportGcode';
import { displayFeed, type UnitSystem } from '../lib/units';
import type { JobStock } from '../job/stock';
import { jobStockBounds } from '../job/stock';
export async function buildLaserCalibration({
    minFeed,
    maxFeed,
    minPower,
    maxPower,
    interval,
    options,
    stock,
    cut,
}: {
    minFeed: number;
    maxFeed: number;
    minPower: number;
    maxPower: number;
    interval: number;
    options: LaserOptions;
    stock: JobStock;
    cut: boolean;
}) {
    if (
        ![minFeed, maxFeed, minPower, maxPower].every(Number.isFinite) ||
        minFeed <= 0 ||
        maxFeed < minFeed ||
        minPower < 0 ||
        maxPower > 100 ||
        maxPower < minPower
    )
        throw new Error('Check the material test ranges.');
    if (stock.widthMm < 65 || stock.heightMm < 65)
        throw new Error('Material test needs at least 65 × 65 mm of stock.');
    const bounds = jobStockBounds(stock),
        paths = [];
    let first: Record<string, unknown> | undefined;
    for (let row = 0; row < 5; row++)
        for (let col = 0; col < 5; col++) {
            const x = bounds.minX + 5 + col * 11,
                y = bounds.minY + 5 + row * 11,
                feed = minFeed + ((maxFeed - minFeed) * row) / 4,
                power = (minPower + ((maxPower - minPower) * col) / 4) * 10;
            const result = await buildToolpathGcode({
                operation: cut ? 'laser-cut' : 'laser-fill',
                loops: [
                    {
                        points: [
                            { x, y },
                            { x: x + 8, y },
                            { x: x + 8, y: y + 8 },
                            { x, y: y + 8 },
                            { x, y },
                        ],
                    },
                ],
                toolDiameter: 1,
                cutDepth: 1,
                laserFeed: feed,
                laserPower: power,
                laserSpot: interval,
                laserOptions: { ...options, kerf: 0 },
            });
            first ??= result.toolpath;
            paths.push(
                ...(result.toolpath.laserPaths as { points: unknown[] }[]).map(
                    (p) => ({ ...p, feed }),
                ),
            );
        }
    return {
        ...first,
        laserRotary: stock.laserRotary,
        label: 'Material test — rows: feed low to high from bottom; columns: power low to high from left',
        laserPaths: paths,
    };
}
export function LaserCalibration({
    units,
    laser,
    operation,
    interval,
    options,
    stock,
    onPick,
    onClose,
    reference,
    motionLimit,
}: {
    units: UnitSystem;
    laser: string;
    operation: string;
    interval: number;
    options: LaserOptions;
    stock: JobStock;
    onPick: (feed: number, power: number) => void;
    onClose: () => void;
    reference?: { feed: number; power: number };
    motionLimit?: number;
}) {
    const [range] = useState(() =>
        laserCalibrationRange(reference, motionLimit),
    );
    const [minFeed, setMinFeed] = useState(range.minFeed),
        [maxFeed, setMaxFeed] = useState(range.maxFeed),
        [minPower, setMinPower] = useState(range.minPower),
        [maxPower, setMaxPower] = useState(range.maxPower),
        [status, setStatus] = useState(''),
        [busy, setBusy] = useState(false);
    async function download() {
        setBusy(true);
        try {
            if (!laser.trim())
                throw new Error('Choose or name your laser setup first.');
            if (motionLimit && maxFeed > motionLimit)
                throw new Error(
                    'Test feed exceeds the configured machine limit.',
                );
            const path = await buildLaserCalibration({
                minFeed,
                maxFeed,
                minPower,
                maxPower,
                interval,
                options,
                stock,
                cut: operation === 'laser-cut',
            });
            const settings = loadOutput();
            const gcode = exportToolpaths(
                [path],
                `material-test-${laser}`,
                false,
                'metric',
                settings,
            );
            await downloadGcode(
                gcode,
                'laser-material-test',
                settings.extension,
            );
            setStatus(
                'Run the sheet, then select the best cell below and save it as a suggestion.',
            );
        } catch (e) {
            setStatus(outputError(e));
        } finally {
            setBusy(false);
        }
    }
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Material test"
                label="Laser material test"
                closeLabel="Close material test"
                onClose={onClose}
                placement="right"
                className="pointer-events-auto w-[520px] max-w-full max-h-full"
            >
                <section className="space-y-2 rounded border border-slate-300 bg-white p-2 dark:border-robin-900 dark:bg-dark">
                    <h4 className="text-sm font-medium">
                        Material test · 65 × 65 mm
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                            ['Min feed (mm/min)', minFeed, setMinFeed],
                            ['Max feed (mm/min)', maxFeed, setMaxFeed],
                            ['Min power (%)', minPower, setMinPower],
                            ['Max power (%)', maxPower, setMaxPower],
                        ].map(([label, value, setter]) => (
                            <label key={String(label)}>
                                {String(label)}
                                <input
                                    type="number"
                                    className="w-full rounded border px-2 py-1 dark:bg-dark"
                                    value={value as number}
                                    onChange={(e) =>
                                        (setter as (v: number) => void)(
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    <button
                        className="rounded bg-robin-500 px-3 py-2 text-sm text-white disabled:opacity-40"
                        disabled={busy}
                        onClick={() => void download()}
                    >
                        {busy ? 'Building…' : 'Download test sheet'}
                    </button>
                    <p className="text-[11px] text-slate-500">
                        Pick the best physical result. Top row is fastest; left
                        column is lowest power. Cells use the current pass count
                        and line interval.
                    </p>
                    <div
                        className="grid grid-cols-5 gap-1"
                        aria-label="Material test results"
                    >
                        {Array.from({ length: 5 }, (_, r) => 4 - r).flatMap(
                            (row) =>
                                Array.from({ length: 5 }, (_, col) => {
                                    const f =
                                            minFeed +
                                            ((maxFeed - minFeed) * row) / 4,
                                        p =
                                            minPower +
                                            ((maxPower - minPower) * col) / 4;
                                    return (
                                        <button
                                            key={`${row}-${col}`}
                                            className="rounded border border-slate-300 p-1 text-[10px] hover:bg-robin-100 dark:hover:bg-robin-900"
                                            title={`${displayFeed(f, units)} · ${p}%`}
                                            onClick={() => onPick(f, p * 10)}
                                        >
                                            {displayFeed(f, units)}
                                            <br />
                                            {p}%
                                        </button>
                                    );
                                }),
                        )}
                    </div>
                    {status && (
                        <p role="status" className="text-xs">
                            {status}
                        </p>
                    )}
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
