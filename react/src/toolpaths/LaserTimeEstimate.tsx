import { useEffect, useRef, useState } from 'react';
import type { TimedPreview } from '../engine/prepare-timed-preview';
import type { TimingSettings, TimeEstimate } from '../gcode/estimateTime';
import type { OutputSettings } from '../gcode/profiles';
import { createTimeEstimateWorker } from './timeEstimateWorker';

const KEY = 'gcam.laserTiming.v1';
const defaults: Record<string, string> = {
    speedX: '',
    speedY: '',
    speedZ: '',
    accelerationX: '',
    accelerationY: '',
    accelerationZ: '',
    startX: '0',
    startY: '0',
    startZ: '0',
    junctionDeviation: '0.01',
};
function savedDraft() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        return Object.fromEntries(
            Object.entries(defaults).map(([key, value]) => [
                key,
                typeof saved?.[key] === 'string' ? saved[key] : value,
            ]),
        );
    } catch {
        return { ...defaults };
    }
}
function duration(seconds: number) {
    const whole = Math.ceil(seconds);
    return (
        Math.floor(whole / 3600) +
        ':' +
        String(Math.floor(whole / 60) % 60).padStart(2, '0') +
        ':' +
        String(whole % 60).padStart(2, '0')
    );
}
type Summary = Omit<TimeEstimate, 'lineEndSeconds'>;

export function LaserTimeEstimate({
    gcode,
    dwell,
    onPlan,
    laserMax,
}: {
    gcode: string;
    dwell: OutputSettings['dwell'];
    onPlan?: (plan: TimedPreview | null) => void;
    laserMax?: number;
}) {
    const [draft, setDraft] = useState(savedDraft);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [result, setResult] = useState<{
        gcode: string;
        dwell: string;
        value: Summary;
    } | null>(null);
    const worker = useRef<Worker | null>(null);
    const revision = useRef(0);
    useEffect(() => {
        revision.current++;
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setStatus('');
        setError('');
        setResult(null);
        onPlan?.(null);
        return () => {
            revision.current++;
            worker.current?.terminate();
            worker.current = null;
        };
    }, [gcode, dwell, laserMax, onPlan]);
    const cancel = () => {
        revision.current++;
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setStatus('');
    };
    const field = (key: string, label: string, positive: boolean) => (
        <input
            type="number"
            step="any"
            required
            min={
                positive
                    ? 0.000001
                    : key === 'junctionDeviation'
                      ? 0
                      : undefined
            }
            aria-label={label}
            value={draft[key]}
            className="w-full min-w-0 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-robin-900"
            onChange={(event) => {
                cancel();
                setResult(null);
                onPlan?.(null);
                setError('');
                setDraft({ ...draft, [key]: event.target.value });
            }}
        />
    );
    const current =
        result?.gcode === gcode && result.dwell === dwell ? result.value : null;
    return (
        <details
            aria-label="Laser time estimate"
            className="shrink-0 max-h-[45vh] overflow-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-robin-900 dark:bg-dark dark:text-slate-200"
        >
            <summary className="cursor-pointer font-medium">
                Time estimate{current ? ' · ' + duration(current.seconds) : ''}
            </summary>
            <form
                className="mt-2 space-y-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    cancel();
                    setResult(null);
                    onPlan?.(null);
                    setError('');
                    setBusy(true);
                    setStatus('Estimating…');
                    const id = revision.current;
                    const vector = (prefix: string) =>
                        ['X', 'Y', 'Z'].map((axis) =>
                            Number(draft[prefix + axis]),
                        ) as [number, number, number];
                    const settings: TimingSettings = {
                        maxSpeed: vector('speed'),
                        acceleration: vector('acceleration'),
                        start: vector('start'),
                        junctionDeviation: Number(draft.junctionDeviation),
                    };
                    try {
                        const active = createTimeEstimateWorker();
                        worker.current = active;
                        const fail = (message: string) => {
                            if (id !== revision.current) return;
                            active.terminate();
                            worker.current = null;
                            setBusy(false);
                            setStatus('');
                            setError(message);
                        };
                        active.onerror = () =>
                            fail('Unable to estimate this program.');
                        active.onmessage = (event) => {
                            if (id !== revision.current) return;
                            if ('progress' in event.data) {
                                setStatus(
                                    'Estimating… ' + event.data.progress + '%',
                                );
                                return;
                            }
                            if ('error' in event.data) {
                                fail(event.data.error);
                                return;
                            }
                            active.terminate();
                            worker.current = null;
                            setBusy(false);
                            setStatus('');
                            onPlan?.(event.data.result.preview ?? null);
                            setResult({
                                gcode,
                                dwell,
                                value: event.data.result,
                            });
                            try {
                                localStorage.setItem(
                                    KEY,
                                    JSON.stringify(draft),
                                );
                            } catch {
                                /* Storage may be unavailable. */
                            }
                        };
                        active.postMessage({
                            gcode,
                            settings,
                            dwell,
                            laserMax,
                        });
                    } catch {
                        setBusy(false);
                        setStatus('');
                        setError('Unable to start time estimation.');
                    }
                }}
            >
                <p>
                    Preview assumptions only. Enter controller values; these do
                    not change the machine or G-code.
                </p>
                <table className="w-full table-fixed">
                    <thead>
                        <tr>
                            <th className="w-2/5 text-left">Axis</th>
                            {['X', 'Y', 'Z'].map((axis) => (
                                <th key={axis}>{axis}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ['speed', 'Maximum speed (mm/min)', true],
                            ['acceleration', 'Acceleration (mm/s²)', true],
                            ['start', 'Initial work position (mm)', false],
                        ].map(([prefix, label, positive]) => (
                            <tr key={String(prefix)}>
                                <th className="text-left font-normal pr-2">
                                    {label}
                                </th>
                                {['X', 'Y', 'Z'].map((axis) => (
                                    <td className="p-0.5" key={axis}>
                                        {field(
                                            prefix + axis,
                                            axis + ' ' + label,
                                            Boolean(positive),
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <label className="flex items-center gap-2">
                    Corner accuracy (mm)
                    <span className="w-24">
                        {field(
                            'junctionDeviation',
                            'Corner accuracy (mm)',
                            false,
                        )}
                    </span>
                </label>
                <p className="text-slate-500 dark:text-slate-400">
                    Junction-deviation model. Includes motion and dwell;
                    excludes sender delays, buffering and unknown controller
                    actions. Verify against a real job.
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        disabled={busy || !gcode.trim()}
                        className="rounded border px-3 py-1 disabled:opacity-40"
                    >
                        Estimate
                    </button>
                    {busy && (
                        <button
                            type="button"
                            className="rounded border px-3 py-1"
                            onClick={cancel}
                        >
                            Cancel estimate
                        </button>
                    )}
                    <span role="status">{status}</span>
                    {current && (
                        <output
                            aria-label="Estimated job time"
                            className="font-medium"
                        >
                            {duration(current.seconds)} estimated
                        </output>
                    )}
                </div>
                {error && <p role="alert">{error}</p>}
            </form>
        </details>
    );
}
