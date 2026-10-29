import { useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';

export function SurfaceUnitsModal({
    fileName,
    sizeMm,
    onApply,
    onCancel,
}: {
    fileName: string;
    sizeMm: { x: number; y: number; z: number };
    onApply(units: 'mm' | 'inch'): void;
    onCancel(): void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    useDialogFocus(panelRef, true);
    const [units, setUnits] = useState<'mm' | 'inch' | ''>('');

    return (
        <div
            ref={panelRef}
            tabIndex={-1}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    onCancel();
                }
            }}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="surface-units-title"
        >
            <section className="w-full max-w-md max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark">
                <h2
                    id="surface-units-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    Check model units
                </h2>

                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Choose the model’s original units, then check the size
                    below.
                </p>
                <label className="mt-4 block text-sm text-slate-700 dark:text-slate-200">
                    Model units
                    <select
                        aria-label="Model units"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-robin-800 dark:bg-dark-lighter dark:text-white"
                        value={units}
                        onChange={(event) =>
                            setUnits(event.currentTarget.value as 'mm' | 'inch')
                        }
                    >
                        <option value="" disabled>
                            Select units…
                        </option>
                        <option value="mm">Millimetres (mm)</option>
                        <option value="inch">Inches (in)</option>
                    </select>
                </label>
                <div
                    className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-robin-900 dark:bg-dark-lighter"
                    aria-live="polite"
                >
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                        Model size if units are:
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                        Millimetres: {sizeMm.x.toFixed(1)} ×{' '}
                        {sizeMm.y.toFixed(1)} × {sizeMm.z.toFixed(1)} mm
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                        Inches: {(sizeMm.x * 25.4).toFixed(1)} ×{' '}
                        {(sizeMm.y * 25.4).toFixed(1)} ×{' '}
                        {(sizeMm.z * 25.4).toFixed(1)} mm
                    </p>
                </div>
                <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    Wrong units change the size by 25.4 times.
                </p>
                <p
                    className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400"
                    title={fileName}
                >
                    {fileName}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-robin-800 dark:text-slate-200 dark:hover:bg-dark-lighter"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!units}
                        onClick={() => units && onApply(units)}
                        className="rounded bg-robin-600 px-3 py-2 text-sm font-medium text-white enabled:hover:bg-robin-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Continue to model setup
                    </button>
                </div>
            </section>
        </div>
    );
}
