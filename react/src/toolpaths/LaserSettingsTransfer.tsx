import { useState } from 'react';
import {
    copyLaserSettings,
    type CopiedLaserSettings,
    type LaserSettingsSource,
} from './copy-laser-settings';

export function LaserSettingsTransfer({
    sources,
    operation,
    currentId,
    maxFeed,
    onApply,
}: {
    sources: LaserSettingsSource[];
    operation: string;
    currentId?: string;
    maxFeed?: number;
    onApply: (settings: CopiedLaserSettings) => void;
}) {
    const [sourceId, setSourceId] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const eligible = sources.filter(
        (s) => s.id !== currentId && s.args.operation === operation,
    );
    const selected = eligible.find((s) => s.id === sourceId);
    if (!eligible.length) return null;
    return (
        <details className="rounded-lg border border-slate-200 p-2 text-xs dark:border-robin-900">
            <summary className="cursor-pointer">
                Copy operation settings
            </summary>
            <div className="mt-2 flex gap-2">
                <select
                    aria-label="Copy laser settings from"
                    className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 dark:border-robin-900 dark:bg-dark"
                    value={selected?.id ?? ''}
                    onChange={(e) => {
                        setSourceId(e.target.value);
                        setMessage('');
                        setError('');
                    }}
                >
                    <option value="">Choose operation</option>
                    {eligible.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.customLabel ?? s.label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!selected}
                    className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-robin-900"
                    onClick={() => {
                        if (!selected) return;
                        try {
                            const settings = copyLaserSettings(
                                selected.args,
                                operation,
                                maxFeed,
                            );
                            onApply(settings);
                            setError('');
                            setMessage('Settings copied.');
                        } catch (e) {
                            setMessage('');
                            setError(
                                e instanceof Error ? e.message : String(e),
                            );
                        }
                    }}
                >
                    Apply settings
                </button>
            </div>
            <p className="mt-1 text-slate-500">
                Same operation type. Keeps artwork, crop, mask and scan
                calibration.
            </p>
            {message && (
                <p role="status" className="mt-1">
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" className="mt-1 text-red-600">
                    {error}
                </p>
            )}
        </details>
    );
}
