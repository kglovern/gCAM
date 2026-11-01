import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { processLaserImageInWorker } from '../engine/cam-worker-client';
import { FULL_IMAGE, resolveImageCrop } from '../cam/raster-region.js';
import {
    LaserImageCompare,
    type LaserImageCompareCache,
} from './LaserImageCompare';
import { LaserImageAdjustments } from './LaserImageAdjustments';
import { LaserImagePresets } from './LaserImagePresets';
import type { LaserOptions } from './toolpathRequest';
import type { RasterBitmap } from '../lib/engine';
import type { UnitSystem } from '../lib/units';
export type ImageAdjustSettings = {
    options: LaserOptions;
    gamma: number;
    interval: number;
};
export function LaserImageAdjust({
    bitmap,
    source,
    settings,
    units,
    onClose,
    onApply,
}: {
    bitmap: RasterBitmap;
    source: HTMLImageElement;
    settings: ImageAdjustSettings;
    units: UnitSystem;
    onClose(): void;
    onApply(settings: ImageAdjustSettings): void;
}) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, true);
    const [draft, setDraft] = useState<ImageAdjustSettings>(() => ({
        ...settings,
        options: { ...settings.options },
    }));
    const [cache, setCache] = useState<LaserImageCompareCache | null>(null),
        [busy, setBusy] = useState(true),
        [progress, setProgress] = useState(0),
        [error, setError] = useState(''),
        [invert, setInvert] = useState(false);
    const update = (patch: LaserOptions) =>
        setDraft((d) => ({ ...d, options: { ...d.options, ...patch } }));
    useEffect(() => {
        let active = true,
            job: ReturnType<typeof processLaserImageInWorker> | undefined;
        setBusy(true);
        setError('');
        setProgress(0);
        const timer = setTimeout(() => {
            try {
                job = processLaserImageInWorker(
                    {
                        bitmap: {
                            bounds: bitmap.bounds,
                            _imageData: bitmap.imageData,
                        },
                        interval: draft.interval,
                        gamma: draft.gamma,
                        options: draft.options,
                    },
                    (p) => {
                        if (active) setProgress(p.percent);
                    },
                );
                void job.promise
                    .then((image) => {
                        if (!active) return;
                        if (image.width > 32768 || image.height > 32768)
                            throw new Error(
                                'Preview exceeds canvas limits; reduce DPI or crop the image.',
                            );
                        const canvas = document.createElement('canvas');
                        canvas.width = image.width;
                        canvas.height = image.height;
                        const context = canvas.getContext('2d');
                        if (!context)
                            throw new Error('Image preview is unavailable.');
                        const pixels = context.createImageData(
                            image.width,
                            image.height,
                        );
                        pixels.data.set(image.data);
                        context.putImageData(pixels, 0, 0);
                        const crop = resolveImageCrop(
                            draft.options.imageCrop ?? FULL_IMAGE,
                            bitmap.imageData.width,
                            bitmap.imageData.height,
                            Boolean(draft.options.passThrough),
                        );
                        setCache({
                            canvas,
                            width: image.width,
                            height: image.height,
                            crop,
                        });
                        setBusy(false);
                    })
                    .catch((e) => {
                        if (active) {
                            setError(
                                e instanceof Error ? e.message : String(e),
                            );
                            setBusy(false);
                        }
                    });
            } catch (e) {
                if (active) {
                    setError(e instanceof Error ? e.message : String(e));
                    setBusy(false);
                }
            }
        }, 120);
        return () => {
            active = false;
            clearTimeout(timer);
            job?.cancel();
        };
    }, [bitmap, draft]);
    const dpi = 25.4 / draft.interval;
    const input =
        'w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-robin-900 dark:bg-dark';
    return createPortal(
        <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Adjust laser image"
            tabIndex={-1}
            className="fixed inset-0 z-50 bg-black/50"
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                }
            }}
        >
            <FloatingPanel
                title="Adjust image"
                label="Image adjustment"
                closeLabel="Cancel image adjustments"
                placement="right"
                onClose={onClose}
                className="w-[1050px] max-w-[calc(100vw-16px)] max-h-[calc(var(--app-height,100dvh)-16px)]"
            >
                <div className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <LaserImageCompare
                        source={source}
                        cache={cache}
                        invert={invert}
                        onInvert={setInvert}
                    />
                    <div
                        className="flex min-h-4 items-center gap-2"
                        aria-live="polite"
                    >
                        {error ? (
                            <p role="alert" className="text-red-600">
                                {error}
                            </p>
                        ) : busy ? (
                            <span role="status">
                                Processing image… {progress}%
                            </span>
                        ) : cache ? (
                            <span aria-label="Processed image size">
                                {cache.width} × {cache.height} px
                            </span>
                        ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <fieldset
                            disabled={draft.options.passThrough}
                            className="grid grid-cols-2 gap-2 disabled:opacity-50"
                        >
                            <label>
                                Resolution (DPI)
                                <input
                                    aria-label="Adjustment DPI"
                                    type="number"
                                    min="1"
                                    step="1"
                                    className={input}
                                    value={
                                        Number.isFinite(dpi)
                                            ? Number(dpi.toFixed(2))
                                            : ''
                                    }
                                    onChange={(e) => {
                                        const dpi = Number(e.target.value);
                                        setDraft((d) => ({
                                            ...d,
                                            interval: dpi > 0 ? 25.4 / dpi : 0,
                                        }));
                                    }}
                                />
                            </label>
                            <label>
                                Gamma
                                <input
                                    aria-label="Adjustment gamma"
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    className={input}
                                    value={draft.gamma}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            gamma: Number(e.target.value),
                                        }))
                                    }
                                />
                            </label>
                        </fieldset>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={Boolean(draft.options.passThrough)}
                                onChange={(e) =>
                                    update({ passThrough: e.target.checked })
                                }
                            />
                            Pixel pass-through
                        </label>
                    </div>
                    <LaserImageAdjustments
                        options={draft.options}
                        update={update}
                        units={units}
                        className="grid grid-cols-3 gap-2 disabled:opacity-50 md:grid-cols-4"
                    />
                    <LaserImagePresets
                        interval={draft.interval}
                        options={draft.options}
                        gamma={draft.gamma}
                        onApply={(preset) =>
                            setDraft((d) => ({
                                ...d,
                                gamma: preset.gamma ?? d.gamma,
                                interval: preset.interval ?? d.interval,
                                options: { ...d.options, ...preset.options },
                            }))
                        }
                    />
                    <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white pt-2 dark:bg-dark">
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
                            disabled={busy || Boolean(error) || !cache}
                            onClick={() => onApply(draft)}
                        >
                            Apply image settings
                        </button>
                    </footer>
                </div>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
