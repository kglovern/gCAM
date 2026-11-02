import { LaserImageAdjust, type ImageAdjustSettings } from './LaserImageAdjust';
import type { UnitSystem } from '../lib/units';
import { useEffect, useRef, useState } from 'react';
import { processLaserImageInWorker } from '../engine/cam-worker-client';
import { processedImagePng } from '../platform/processedImagePng';
import { saveBinaryFile } from '../platform/saveTextFile';
import type { RasterBitmap } from '../lib/engine';
import type { LaserOptions } from './toolpathRequest';

export function LaserImageExport({
    readBitmap,
    interval,
    gamma,
    options,
    sourceImage,
    units,
    onAdjust,
}: {
    readBitmap: () => RasterBitmap;
    interval: number;
    gamma: number;
    options: LaserOptions;
    sourceImage?: HTMLImageElement;
    units: UnitSystem;
    onAdjust(settings: ImageAdjustSettings): void;
}) {
    const [inspection, setInspection] = useState<{
        bitmap: RasterBitmap;
        source: HTMLImageElement;
    } | null>(null);
    const task = useRef<ReturnType<typeof processLaserImageInWorker> | null>(
        null,
    );
    const generation = useRef(0);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState('');
    const cancel = () => {
        generation.current++;
        task.current?.cancel();
        task.current = null;
        setProgress(null);
    };
    useEffect(
        () => () => {
            generation.current++;
            task.current?.cancel();
        },
        [],
    );
    const save = async () => {
        const current = ++generation.current;
        setError('');
        setProgress(0);
        try {
            const bitmap = readBitmap();
            const job = processLaserImageInWorker(
                {
                    bitmap: {
                        bounds: bitmap.bounds,
                        _imageData: bitmap.imageData,
                    },
                    interval,
                    gamma,
                    options,
                },
                (p) => setProgress(p.percent),
            );
            task.current = job;
            const image = await job.promise;
            if (current !== generation.current) return;
            setProgress(90);
            const png = await processedImagePng(image);
            if (current !== generation.current) return;
            await saveBinaryFile(png, 'processed-laser-image.png');
        } catch (e) {
            if (
                current === generation.current &&
                !(e instanceof DOMException && e.name === 'AbortError')
            )
                setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (current === generation.current) {
                task.current = null;
                setProgress(null);
            }
        }
    };
    return (
        <div className="space-y-1">
            {inspection && (
                <LaserImageAdjust
                    bitmap={inspection.bitmap}
                    source={inspection.source}
                    settings={{ options, gamma, interval }}
                    units={units}
                    onClose={() => setInspection(null)}
                    onApply={(settings) => {
                        onAdjust(settings);
                        setInspection(null);
                    }}
                />
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-robin-900"
                    disabled={!sourceImage || progress !== null}
                    onClick={() => {
                        try {
                            if (sourceImage)
                                setInspection({
                                    bitmap: readBitmap(),
                                    source: sourceImage,
                                });
                        } catch (e) {
                            setError(
                                e instanceof Error ? e.message : String(e),
                            );
                        }
                    }}
                >
                    Adjust image…
                </button>
                <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-robin-900"
                    disabled={progress !== null}
                    onClick={save}
                >
                    Save processed PNG
                </button>
                {progress !== null && (
                    <>
                        <span role="status" className="text-xs">
                            {progress}%
                        </span>
                        <button
                            type="button"
                            onClick={cancel}
                            className="text-xs underline"
                        >
                            Cancel image export
                        </button>
                    </>
                )}
            </div>
            <p className="text-xs text-slate-500">
                {options.passThrough ? 'Source pixels' : 'Current DPI'} ·
                crop/mask · white background
            </p>
            {error && (
                <p role="alert" className="text-xs text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
}
