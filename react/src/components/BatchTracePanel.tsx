import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from './floating/FloatingPanel';
import {
    batchSvgNames,
    traceFileToSvg,
    type BatchTraceSettings,
} from '../lib/batch-trace';
import { saveTextFile } from '../platform/saveTextFile';
interface Result {
    name: string;
    outputName: string;
    status: 'Waiting' | 'Tracing' | 'Ready' | 'Failed' | 'Stopped';
    svg?: string;
    paths?: number;
    error?: string;
}
export function BatchTracePanel({ onClose }: { onClose(): void }) {
    const [settings, setSettings] = useState<BatchTraceSettings>({
        mode: 'outline',
        resolution: 800,
    });
    const [rows, setRows] = useState<Result[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const picker = useRef<HTMLInputElement>(null);
    const job = useRef<AbortController | null>(null);
    useEffect(() => () => job.current?.abort(), []);
    const stop = () => {
        job.current?.abort();
        setBusy(false);
        setRows((current) =>
            current.map((row) =>
                row.status === 'Waiting' || row.status === 'Tracing'
                    ? { ...row, status: 'Stopped' }
                    : row,
            ),
        );
    };
    const close = () => {
        job.current?.abort();
        onClose();
    };
    const start = async (files: File[]) => {
        if (!files.length) return;
        if (files.length > 50) {
            setError('Choose up to 50 images per batch.');
            return;
        }
        job.current?.abort();
        const controller = new AbortController();
        job.current = controller;
        const names = batchSvgNames(files.map((file) => file.name));
        setRows(
            files.map((file, i) => ({
                name: file.name,
                outputName: names[i],
                status: 'Waiting',
            })),
        );
        setBusy(true);
        setError('');
        let bytes = 0;
        for (let i = 0; i < files.length; i++) {
            if (controller.signal.aborted) return;
            setRows((current) =>
                current.map((row, index) =>
                    index === i ? { ...row, status: 'Tracing' } : row,
                ),
            );
            try {
                const traced = await traceFileToSvg(
                    files[i],
                    settings,
                    controller.signal,
                );
                if (controller.signal.aborted) return;
                bytes += new Blob([traced.svg]).size;
                if (bytes > 33554432) {
                    setError(
                        'Batch output exceeds 32 MB; use fewer images or a lower resolution.',
                    );
                    setRows((current) =>
                        current.map((row, index) =>
                            index >= i ? { ...row, status: 'Stopped' } : row,
                        ),
                    );
                    break;
                }
                setRows((current) =>
                    current.map((row, index) =>
                        index === i
                            ? { ...row, ...traced, status: 'Ready' }
                            : row,
                    ),
                );
            } catch (reason) {
                if (controller.signal.aborted) return;
                setRows((current) =>
                    current.map((row, index) =>
                        index === i
                            ? {
                                  ...row,
                                  status: 'Failed',
                                  error:
                                      reason instanceof Error
                                          ? reason.message
                                          : 'Trace failed.',
                              }
                            : row,
                    ),
                );
            }
        }
        if (job.current === controller) setBusy(false);
    };
    const ready = rows.filter((row) => row.svg);
    const button =
        'rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-robin-900';
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Trace images to SVG"
                label="Batch image trace"
                closeLabel="Close batch trace"
                onClose={close}
                placement="right"
                className="pointer-events-auto w-[520px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs text-slate-700 dark:bg-dark dark:text-slate-200">
                    <fieldset
                        disabled={busy}
                        className="grid grid-cols-2 gap-2"
                    >
                        <label>
                            Trace mode
                            <select
                                aria-label="Batch trace mode"
                                value={settings.mode}
                                className="mt-1 w-full rounded border bg-transparent p-1.5"
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        mode: e.target
                                            .value as BatchTraceSettings['mode'],
                                    })
                                }
                            >
                                <option value="outline">Outline</option>
                                <option value="centerline">Center line</option>
                            </select>
                        </label>
                        <label>
                            Resolution
                            <select
                                aria-label="Batch trace resolution"
                                value={settings.resolution}
                                className="mt-1 w-full rounded border bg-transparent p-1.5"
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        resolution: Number(e.target.value),
                                    })
                                }
                            >
                                {[800, 1600, 3200].map((size) => (
                                    <option key={size} value={size}>
                                        {size} px maximum
                                    </option>
                                ))}
                                <option value={0}>
                                    Original (up to 16 MP)
                                </option>
                            </select>
                        </label>
                    </fieldset>
                    <input
                        ref={picker}
                        aria-label="Images to trace"
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = '';
                            void start(files);
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <button
                            className={button}
                            disabled={busy}
                            onClick={() => picker.current?.click()}
                        >
                            Choose images
                        </button>
                        {busy && (
                            <button className={button} onClick={stop}>
                                Stop
                            </button>
                        )}
                        <span role="status">
                            {ready.length} of {rows.length} ready
                        </span>
                    </div>
                    {error && (
                        <p role="alert" className="text-red-600">
                            {error}
                        </p>
                    )}
                    {!!rows.length && (
                        <ul
                            className="max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-robin-900"
                            aria-label="Trace results"
                        >
                            {rows.map((row, i) => (
                                <li
                                    key={i}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div
                                            className="truncate font-medium"
                                            title={row.name}
                                        >
                                            {row.name}
                                        </div>
                                        <div
                                            className={
                                                row.status === 'Failed'
                                                    ? 'text-red-600'
                                                    : 'text-slate-500'
                                            }
                                        >
                                            {row.error ??
                                                (row.status === 'Ready'
                                                    ? `${row.paths} paths · ${row.outputName}`
                                                    : row.status)}
                                        </div>
                                    </div>
                                    {row.svg && (
                                        <button
                                            className={button}
                                            aria-label={`Save ${row.outputName}`}
                                            onClick={() =>
                                                saveTextFile(
                                                    row.svg!,
                                                    row.outputName,
                                                    'image/svg+xml',
                                                )
                                            }
                                        >
                                            Save SVG
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {ready.length > 1 &&
                        !(window as Window & { cordova?: unknown }).cordova && (
                            <button
                                className={button}
                                onClick={() =>
                                    ready.forEach((row) =>
                                        saveTextFile(
                                            row.svg!,
                                            row.outputName,
                                            'image/svg+xml',
                                        ),
                                    )
                                }
                            >
                                Save all SVGs
                            </button>
                        )}
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
