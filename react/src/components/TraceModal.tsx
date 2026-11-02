/**
 * Purpose: Implementation module for TraceModal in the components domain.
 */
import { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import cx from 'classnames';
import { type PlacedTrace } from '../lib/trace';
import { traceBitmapInWorker } from '../engine/cam-worker-client';

interface TraceModalProps {
    fileName: string;
    img: HTMLImageElement;
    originX: number;
    originY: number;
    widthMm: number;
    heightMm: number;
    rotation?: number;
    onClose: () => void;
    onImport: (traced: PlacedTrace[], deleteImage: boolean) => void;
}

/**
 * Bitmap trace workbench (camcanvas trace modal parity): adjust the scan
 * with live preview, then import the result as editable vectors.
 */
export function TraceModal({
    fileName,
    img,
    originX,
    originY,
    widthMm,
    heightMm,
    rotation = 0,
    onClose,
    onImport,
}: TraceModalProps) {
    const [traceMode, setTraceMode] = useState<'outline' | 'centerline'>(
        'outline',
    );
    const [threshold, setThreshold] = useState(128);
    const [cutoff, setCutoff] = useState(0);
    const [brightness, setBrightness] = useState(0);
    const [contrast, setContrast] = useState(0);
    const [invert, setInvert] = useState(false);
    const [deleteImage, setDeleteImage] = useState(true);
    const [traceTransparency, setTraceTransparency] = useState(false);
    const [resolution, setResolution] = useState(800);
    const [error, setError] = useState('');
    const [turdsize, setTurdsize] = useState(2);
    const [smoothness, setSmoothness] = useState(1);
    const [optimize, setOptimize] = useState(0.2);
    const [vectorCount, setVectorCount] = useState(0);
    const [working, setWorking] = useState(true);
    const workRef = useRef<HTMLCanvasElement>(null);
    const previewRef = useRef<HTMLCanvasElement>(null);
    const tracedRef = useRef<PlacedTrace[]>([]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        let task: ReturnType<typeof traceBitmapInWorker> | undefined;
        setWorking(true);
        setError('');
        tracedRef.current = [];
        const failed = (reason: unknown) => {
            if (cancelled) return;
            tracedRef.current = [];
            setVectorCount(0);
            setWorking(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        };
        const timer = window.setTimeout(() => {
            try {
                const work = workRef.current,
                    preview = previewRef.current;
                if (!work || !preview)
                    throw new Error('Trace preview is unavailable.');
                const scale = resolution
                    ? Math.min(
                          1,
                          resolution /
                              Math.max(1, img.naturalWidth, img.naturalHeight),
                      )
                    : 1;
                const pw = Math.max(1, Math.round(img.naturalWidth * scale)),
                    ph = Math.max(1, Math.round(img.naturalHeight * scale));
                if (pw * ph > 16777216)
                    throw new Error(
                        'Trace exceeds 16 million pixels; choose a lower resolution.',
                    );
                work.width = pw;
                work.height = ph;
                const context = work.getContext('2d', {
                    willReadFrequently: true,
                });
                if (!context) throw new Error('Could not read trace pixels.');
                context.drawImage(img, 0, 0, pw, ph);
                const image = context.getImageData(0, 0, pw, ph);
                const previewScale = 560 / Math.max(pw, ph);
                preview.width = Math.max(1, Math.round(pw * previewScale));
                preview.height = Math.max(1, Math.round(ph * previewScale));
                task = traceBitmapInWorker({
                    image: { width: pw, height: ph, data: image.data },
                    placement: {
                        x: originX,
                        y: originY,
                        width: widthMm,
                        height: heightMm,
                        rotation,
                    },
                    options: {
                        brightness,
                        contrast,
                        traceMode,
                        threshold,
                        cutoff,
                        invert,
                        turdsize,
                        smoothness,
                        optimize,
                        traceTransparency,
                    },
                });
                task.promise.then((traced) => {
                    if (cancelled) return;
                    tracedRef.current = traced;
                    setVectorCount(traced.length);
                    const context = preview.getContext('2d');
                    if (context) {
                        context.fillStyle = '#ffffff';
                        context.fillRect(0, 0, preview.width, preview.height);
                        context.strokeStyle = '#0f766e';
                        context.lineWidth = 1.5;
                        const angle = (rotation * Math.PI) / 180,
                            cos = Math.cos(angle),
                            sin = Math.sin(angle);
                        for (const path of traced) {
                            context.beginPath();
                            path.points.forEach((point, index) => {
                                const dx = point.x - originX - widthMm / 2,
                                    dy = point.y - originY - heightMm / 2;
                                const x =
                                    ((dx * cos + dy * sin) / widthMm + 0.5) *
                                    preview.width;
                                const y =
                                    (0.5 - (-dx * sin + dy * cos) / heightMm) *
                                    preview.height;
                                if (index) context.lineTo(x, y);
                                else context.moveTo(x, y);
                            });
                            context.stroke();
                        }
                    }
                    setWorking(false);
                }, failed);
            } catch (reason) {
                failed(reason);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            task?.cancel();
        };
    }, [
        img,
        originX,
        originY,
        widthMm,
        heightMm,
        rotation,
        traceMode,
        threshold,
        cutoff,
        brightness,
        contrast,
        invert,
        turdsize,
        smoothness,
        optimize,
        traceTransparency,
        resolution,
    ]);

    const invalidate = () => {
        setWorking(true);
        tracedRef.current = [];
        setVectorCount(0);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trace-title"
        >
            <div
                className="w-full max-w-3xl max-h-[calc(var(--app-height,100dvh)-16px)] flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-dark"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-robin-900">
                    <div>
                        <h2
                            id="trace-title"
                            className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
                        >
                            <ScanLine size={20} className="text-robin-400" />
                            Trace Bitmap
                        </h2>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {fileName}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close trace bitmap"
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-dark-lighter"
                    >
                        <X size={20} />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Shape preview
                        </div>
                        <canvas
                            ref={previewRef}
                            role="img"
                            aria-label="Traced shape preview"
                            className="w-full rounded-lg border border-slate-200 dark:border-robin-900 bg-white"
                        />
                        <canvas ref={workRef} className="hidden" />
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {working
                                ? 'Scanning…'
                                : `${vectorCount} shape${vectorCount === 1 ? '' : 's'} found`}
                        </div>
                        {error && (
                            <p role="alert" className="text-sm text-red-600">
                                {error}
                            </p>
                        )}
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs">
                                Trace mode
                                <select
                                    aria-label="Trace mode"
                                    className="mt-1 w-full rounded border bg-transparent px-2 py-1"
                                    value={traceMode}
                                    onChange={(e) => {
                                        invalidate();
                                        setTraceMode(
                                            e.target.value as
                                                | 'outline'
                                                | 'centerline',
                                        );
                                    }}
                                >
                                    <option value="outline">Outline</option>
                                    <option value="centerline">
                                        Center line
                                    </option>
                                </select>
                            </label>
                            <label className="block text-xs">
                                Trace resolution
                                <select
                                    aria-label="Trace resolution"
                                    className="mt-1 w-full rounded border bg-transparent px-2 py-1"
                                    value={resolution}
                                    onChange={(event) => {
                                        invalidate();
                                        setResolution(
                                            Number(event.currentTarget.value),
                                        );
                                    }}
                                >
                                    <option value={800}>800 px maximum</option>
                                    <option value={1600}>
                                        1600 px maximum
                                    </option>
                                    <option value={3200}>
                                        3200 px maximum
                                    </option>
                                    <option value={0}>
                                        Original (up to 16 MP)
                                    </option>
                                </select>
                            </label>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                aria-label="Trace transparency"
                                type="checkbox"
                                checked={traceTransparency}
                                onChange={(event) => {
                                    invalidate();
                                    setTraceTransparency(
                                        event.currentTarget.checked,
                                    );
                                }}
                            />
                            Trace transparency
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <Slider
                                label="Cutoff"
                                value={cutoff}
                                min={0}
                                max={threshold}
                                step={1}
                                onChange={(value) => {
                                    invalidate();
                                    setCutoff(value);
                                }}
                            />
                            <Slider
                                label="Threshold"
                                value={threshold}
                                min={0}
                                max={255}
                                step={1}
                                onChange={(value) => {
                                    invalidate();
                                    setThreshold(value);
                                    setCutoff((current) =>
                                        Math.min(current, value),
                                    );
                                }}
                            />
                        </div>
                        <Slider
                            label="Brightness"
                            value={brightness}
                            min={-100}
                            max={100}
                            step={1}
                            onChange={(value) => {
                                invalidate();
                                setBrightness(value);
                            }}
                        />
                        <Slider
                            label="Contrast"
                            value={contrast}
                            min={-100}
                            max={100}
                            step={1}
                            onChange={(value) => {
                                invalidate();
                                setContrast(value);
                            }}
                        />
                        <Slider
                            label="Speckle filter"
                            value={turdsize}
                            min={1}
                            max={32}
                            step={1}
                            onChange={(value) => {
                                invalidate();
                                setTurdsize(value);
                            }}
                        />
                        {traceMode === 'outline' && (
                            <>
                                <Slider
                                    label="Smoothness"
                                    value={smoothness}
                                    min={0}
                                    max={1.33}
                                    step={0.01}
                                    onChange={(value) => {
                                        invalidate();
                                        setSmoothness(value);
                                    }}
                                />
                                <Slider
                                    label="Optimize"
                                    value={optimize}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(value) => {
                                        invalidate();
                                        setOptimize(value);
                                    }}
                                />
                            </>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={deleteImage}
                                    onChange={(e) =>
                                        setDeleteImage(e.target.checked)
                                    }
                                />
                                Delete source image
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={invert}
                                    onChange={(e) => {
                                        invalidate();
                                        setInvert(e.target.checked);
                                    }}
                                    className="accent-robin-500 w-4 h-4"
                                />
                                Invert
                            </label>
                        </div>
                    </div>
                </div>
                <footer className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-robin-900 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 dark:border-robin-900 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onImport(tracedRef.current, deleteImage)}
                        disabled={working || !vectorCount}
                        className={cx(
                            'rounded-lg bg-robin-500 hover:bg-robin-600 disabled:opacity-40 text-white',
                            'px-4 py-2 text-sm font-medium touch-manipulation',
                        )}
                    >
                        Import {vectorCount > 0 ? `(${vectorCount})` : ''}
                    </button>
                </footer>
            </div>
        </div>
    );
}

function Slider({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="block space-y-1">
            <span className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{label}</span>
                <input
                    type="number"
                    aria-label={`${label} value`}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => {
                        const numeric = Number(event.currentTarget.value);
                        if (Number.isFinite(numeric))
                            onChange(Math.max(min, Math.min(max, numeric)));
                    }}
                    className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-slate-900 dark:border-robin-900 dark:bg-dark-lighter dark:text-white"
                />
            </span>
            <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-robin-500"
            />
        </div>
    );
}
