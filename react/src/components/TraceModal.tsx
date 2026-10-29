/**
 * Purpose: Implementation module for TraceModal in the components domain.
 */
import { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import cx from 'classnames';
import {
    preprocessImageData,
    traceProcessedCanvas,
    type PlacedTrace,
} from '../lib/trace';

interface TraceModalProps {
    fileName: string;
    img: HTMLImageElement;
    originX: number;
    originY: number;
    widthMm: number;
    heightMm: number;
    onClose: () => void;
    onImport: (traced: PlacedTrace[]) => void;
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
    onClose,
    onImport,
}: TraceModalProps) {
    const [threshold, setThreshold] = useState(128);
    const [brightness, setBrightness] = useState(0);
    const [contrast, setContrast] = useState(0);
    const [invert, setInvert] = useState(false);
    const [turdsize, setTurdsize] = useState(2);
    const [vectorCount, setVectorCount] = useState(0);
    const [working, setWorking] = useState(true);
    const workRef = useRef<HTMLCanvasElement>(null);
    const previewRef = useRef<HTMLCanvasElement>(null);
    const tracedRef = useRef<PlacedTrace[]>([]);
    const optsRef = useRef({
        threshold,
        brightness,
        contrast,
        invert,
        turdsize,
    });
    optsRef.current = { threshold, brightness, contrast, invert, turdsize };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        setWorking(true);
        const timer = window.setTimeout(() => {
            const work = workRef.current;
            const preview = previewRef.current;
            if (!work || !preview) return;
            const scale = Math.min(
                1,
                800 / Math.max(1, img.naturalWidth, img.naturalHeight),
            );
            const pw = Math.max(1, Math.round(img.naturalWidth * scale));
            const ph = Math.max(1, Math.round(img.naturalHeight * scale));
            work.width = pw;
            work.height = ph;
            const wctx = work.getContext('2d', { willReadFrequently: true });
            if (!wctx) return;
            wctx.drawImage(img, 0, 0, pw, ph);
            const image = wctx.getImageData(0, 0, pw, ph);
            const opts = optsRef.current;
            preprocessImageData(image, {
                brightness: opts.brightness,
                contrast: opts.contrast,
                threshold: opts.threshold,
                invert: opts.invert,
            });
            wctx.putImageData(image, 0, 0);
            preview.width = pw;
            preview.height = ph;
            traceProcessedCanvas(
                work,
                pw,
                ph,
                originX,
                originY,
                widthMm,
                heightMm,
                Math.max(1, Math.round(opts.turdsize)),
            ).then(
                (traced) => {
                    if (cancelled) return;
                    tracedRef.current = traced;
                    setVectorCount(traced.length);
                    const pctx = preview.getContext('2d');
                    if (pctx) {
                        // This is deliberately a geometry preview, not the
                        // thresholded bitmap: it shows exactly what Import
                        // will put on the canvas.
                        pctx.fillStyle = '#ffffff';
                        pctx.fillRect(0, 0, pw, ph);
                        pctx.strokeStyle = '#0f766e';
                        pctx.lineWidth = 1.5;
                        for (const path of traced) {
                            if (path.points.length < 2) continue;
                            pctx.beginPath();
                            path.points.forEach((point, index) => {
                                const x = ((point.x - originX) / widthMm) * pw;
                                const y = ((point.y - originY) / heightMm) * ph;
                                if (index === 0) pctx.moveTo(x, y);
                                else pctx.lineTo(x, y);
                            });
                            pctx.stroke();
                        }
                    }
                    setWorking(false);
                },
                () => {
                    if (cancelled) return;
                    tracedRef.current = [];
                    setVectorCount(0);
                    setWorking(false);
                },
            );
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        img,
        originX,
        originY,
        widthMm,
        heightMm,
        threshold,
        brightness,
        contrast,
        invert,
        turdsize,
    ]);

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
                            className="w-full rounded-lg border border-slate-200 dark:border-robin-900 bg-white"
                        />
                        <canvas ref={workRef} className="hidden" />
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {working
                                ? 'Scanning…'
                                : `${vectorCount} shape${vectorCount === 1 ? '' : 's'} found`}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Slider
                            label="Threshold"
                            value={threshold}
                            min={0}
                            max={255}
                            step={1}
                            onChange={setThreshold}
                        />
                        <Slider
                            label="Brightness"
                            value={brightness}
                            min={-100}
                            max={100}
                            step={1}
                            onChange={setBrightness}
                        />
                        <Slider
                            label="Contrast"
                            value={contrast}
                            min={-100}
                            max={100}
                            step={1}
                            onChange={setContrast}
                        />
                        <Slider
                            label="Speckle filter"
                            value={turdsize}
                            min={1}
                            max={32}
                            step={1}
                            onChange={setTurdsize}
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={invert}
                                onChange={(e) => setInvert(e.target.checked)}
                                className="accent-robin-500 w-4 h-4"
                            />
                            Invert
                        </label>
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
                        onClick={() => onImport(tracedRef.current)}
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
