import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from './floating/FloatingPanel';
import { vectorBitmapInWorker } from '../engine/cam-worker-client';
import {
    paintVectorBitmap,
    vectorBitmapPng,
    type VectorBitmapRequest,
    type VectorBitmapResult,
} from '../lib/vector-bitmap';

export function VectorBitmapPanel({
    shapes,
    fillIds,
    onClose,
    onCommit,
}: {
    shapes: VectorBitmapRequest['shapes'];
    fillIds: string[];
    onClose(): void;
    onCommit(
        result: {
            dataUrl: string;
            img: HTMLImageElement;
            plan: VectorBitmapResult['plan'];
        },
        keep: boolean,
    ): void;
}) {
    const [render, setRender] =
        useState<VectorBitmapRequest['render']>('outline');
    const [dpi, setDpi] = useState(300);
    const [lineWidth, setLineWidth] = useState(0.2);
    const [keep, setKeep] = useState(false);
    const [error, setError] = useState('');
    const [ready, setReady] = useState<Parameters<typeof onCommit>[0] | null>(
        null,
    );
    useEffect(() => {
        let active = true;
        setReady(null);
        setError('');
        const job = vectorBitmapInWorker({
            shapes,
            fillIds,
            render,
            dpi,
            lineWidth,
        });
        void job.promise
            .then(async (result) => {
                let png = result.png;
                if (!png) {
                    if (!active) return;
                    const canvas = document.createElement('canvas');
                    canvas.width = result.plan.widthPx;
                    canvas.height = result.plan.heightPx;
                    const context = canvas.getContext('2d');
                    if (!context)
                        throw new Error('Image rendering is unavailable.');
                    paintVectorBitmap(context, result.plan);
                    const blob = await new Promise<Blob>((resolve, reject) =>
                        canvas.toBlob(
                            (b) =>
                                b
                                    ? resolve(b)
                                    : reject(
                                          new Error('Could not encode image.'),
                                      ),
                            'image/png',
                        ),
                    );
                    png = await vectorBitmapPng(blob, result.plan);
                }
                if (!active) return;
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () =>
                        reject(new Error('Could not read image.'));
                    reader.onload = () => resolve(String(reader.result));
                    reader.readAsDataURL(
                        new Blob([png], { type: 'image/png' }),
                    );
                });
                const img = new Image();
                img.src = dataUrl;
                await img.decode();
                if (active) setReady({ dataUrl, img, plan: result.plan });
            })
            .catch((e) => {
                if (active)
                    setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            active = false;
            job.cancel();
        };
    }, [shapes, fillIds, render, dpi, lineWidth]);
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Convert to bitmap"
                label="Convert to bitmap"
                closeLabel="Close bitmap conversion"
                placement="right"
                onClose={onClose}
                className="pointer-events-auto w-[380px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <div className="grid grid-cols-2 gap-2">
                        <label>
                            Render
                            <select
                                aria-label="Bitmap render"
                                className="w-full rounded border p-2 dark:bg-dark"
                                value={render}
                                onChange={(e) =>
                                    setRender(e.target.value as typeof render)
                                }
                            >
                                <option value="outline">Outlines</option>
                                <option value="fill">Fill closed shapes</option>
                                <option value="operations">
                                    Use laser operations
                                </option>
                            </select>
                        </label>
                        <label>
                            DPI
                            <input
                                aria-label="Bitmap DPI"
                                className="w-full rounded border p-2 dark:bg-dark"
                                type="number"
                                min="25"
                                max="2400"
                                value={dpi}
                                onChange={(e) => setDpi(Number(e.target.value))}
                            />
                        </label>
                        {render !== 'fill' && (
                            <label>
                                Line width (mm)
                                <input
                                    aria-label="Bitmap line width"
                                    className="w-full rounded border p-2 dark:bg-dark"
                                    type="number"
                                    min="0.001"
                                    step="0.1"
                                    value={lineWidth}
                                    onChange={(e) =>
                                        setLineWidth(Number(e.target.value))
                                    }
                                />
                            </label>
                        )}
                    </div>
                    {render === 'operations' && (
                        <p>
                            Enabled Laser Fill shapes are filled; other shapes
                            are outlined.
                        </p>
                    )}
                    <div
                        className="flex h-44 items-center justify-center border bg-white"
                        aria-live="polite"
                    >
                        {ready ? (
                            <img
                                alt="Bitmap preview"
                                src={ready.dataUrl}
                                className="max-h-full max-w-full object-contain"
                            />
                        ) : error ? (
                            <p role="alert">{error}</p>
                        ) : (
                            'Rendering…'
                        )}
                    </div>
                    {ready && (
                        <p>
                            {ready.plan.widthPx} × {ready.plan.heightPx} px ·{' '}
                            {ready.plan.widthMm.toFixed(2)} ×{' '}
                            {ready.plan.heightMm.toFixed(2)} mm
                        </p>
                    )}
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={keep}
                            onChange={(e) => setKeep(e.target.checked)}
                        />
                        Keep original shapes
                    </label>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="rounded border px-3 py-2"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                            disabled={!ready}
                            onClick={() => {
                                if (ready) {
                                    try {
                                        onCommit(ready, keep);
                                    } catch (e) {
                                        setError(
                                            e instanceof Error
                                                ? e.message
                                                : String(e),
                                        );
                                        setReady(null);
                                    }
                                }
                            }}
                        >
                            Convert
                        </button>
                    </div>
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
