import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { flattenImageInWorker } from '../engine/cam-worker-client';
import { imageDataOf } from '../lib/bitmap';
import { processedImagePng } from '../platform/processedImagePng';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { ViewLoop } from '../canvas/types';
import type { LaserOptions } from './toolpathRequest';
import type { FlattenImageCommit } from '../lib/flatten-image-document';
export function LaserImageFlatten({
    bitmap,
    shapes,
    maskSources = [],
    options,
    onCommit,
    onClose,
}: {
    bitmap: PlacedBitmapRecord;
    shapes: ViewLoop[];
    maskSources?: ViewLoop[];
    options: LaserOptions;
    onCommit(value: FlattenImageCommit): void;
    onClose(): void;
}) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, true);
    const [source] = useState(() => ({
        bitmap: { ...bitmap },
        shapes: shapes.map((s) => ({
            ...s,
            points: s.points.map((p) => ({ ...p })),
        })),
        maskSources: maskSources.map((s) => ({
            ...s,
            points: s.points.map((p) => ({ ...p })),
        })),
        crop: options.imageCrop ? { ...options.imageCrop } : undefined,
        mask: options.imageMask?.map((poly) => poly.map((p) => ({ ...p }))),
    }));
    const [ready, setReady] = useState<FlattenImageCommit | null>(null),
        [error, setError] = useState(''),
        [progress, setProgress] = useState(0);
    useEffect(() => {
        let active = true,
            job: ReturnType<typeof flattenImageInWorker> | undefined;
        void (async () => {
            try {
                const img = source.bitmap.img;
                if (source.bitmap.surfaceMesh)
                    throw new Error(
                        'Flattening is for bitmap images, not 3D models.',
                    );
                if (!img?.naturalWidth || !img.naturalHeight)
                    throw new Error(
                        'Source image is still loading. Close and try again.',
                    );
                if (
                    img.naturalWidth * img.naturalHeight > 16777216 ||
                    img.naturalWidth > 32768 ||
                    img.naturalHeight > 32768
                )
                    throw new Error(
                        'Flattening supports source images up to 16 million pixels and 32768 pixels per axis.',
                    );
                job = flattenImageInWorker(
                    {
                        image: imageDataOf(img),
                        placement: {
                            x: source.bitmap.x,
                            y: source.bitmap.y,
                            w: source.bitmap.w,
                            h: source.bitmap.h,
                            rotation: source.bitmap.rotation,
                        },
                        crop: source.crop,
                        mask: source.mask,
                    },
                    (p) => {
                        if (active) setProgress(p.percent);
                    },
                );
                const result = await job.promise;
                if (!active) return;
                const png = await processedImagePng(result);
                if (!active) return;
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () =>
                        reject(new Error('Could not read flattened image.'));
                    reader.onload = () => resolve(String(reader.result));
                    reader.readAsDataURL(png);
                });
                const decoded = new Image();
                decoded.src = dataUrl;
                await decoded.decode();
                if (!active) return;
                setReady({
                    source: source.bitmap,
                    shapes: source.shapes,
                    maskSources: source.maskSources,
                    result: { ...result, data: new Uint8ClampedArray(0) },
                    dataUrl,
                    img: decoded,
                });
            } catch (e) {
                if (active) setError((e as Error).message);
            }
        })();
        return () => {
            active = false;
            job?.cancel();
        };
    }, [source]);
    return createPortal(
        <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Flatten image region"
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
                title="Flatten image region"
                label="Image flattening"
                closeLabel="Cancel image flattening"
                placement="right"
                onClose={onClose}
                className="w-[600px] max-w-[calc(100vw-16px)] max-h-[calc(var(--app-height,100dvh)-16px)]"
            >
                <div className="space-y-3 p-3 text-xs">
                    {ready ? (
                        <>
                            <img
                                src={ready.dataUrl}
                                alt="Flattened image preview"
                                className="max-h-[320px] w-full object-contain rounded border bg-slate-200"
                            />
                            <p>
                                {ready.result.width} × {ready.result.height} px
                                · Native source colours and transparency
                            </p>
                        </>
                    ) : !error ? (
                        <p role="status">
                            Flattening image… {Math.round(progress)}%
                        </p>
                    ) : null}
                    <p>
                        Replaces the source image. Affected toolpaths are
                        removed. Undo restores both.
                    </p>
                    <p>
                        Mask shapes are kept. Engraving adjustments are not
                        baked in.
                    </p>
                    {error && (
                        <p role="alert" className="text-red-600">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 border-t pt-2">
                        <button
                            type="button"
                            className="rounded border px-3 py-2"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!ready}
                            className="rounded bg-robin-500 px-3 py-2 font-medium text-white disabled:opacity-40"
                            onClick={() => {
                                try {
                                    if (ready) {
                                        onCommit(ready);
                                        onClose();
                                    }
                                } catch (e) {
                                    setError((e as Error).message);
                                }
                            }}
                        >
                            Replace with flattened image
                        </button>
                    </div>
                </div>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
