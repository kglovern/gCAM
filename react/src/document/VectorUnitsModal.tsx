/** Explicit units confirmation for vector files without reliable physical dimensions. */
import { useState } from 'react';

const unitChoices = [
    { label: 'Millimetres (mm)', scale: 1 },
    { label: 'Centimetres (cm)', scale: 10 },
    { label: 'Metres (m)', scale: 1000 },
    { label: 'Inches (in)', scale: 25.4 },
    { label: 'Feet (ft)', scale: 304.8 },
];

export function VectorUnitsModal({
    fileName,
    fileType,
    width,
    height,
    onApply,
    onCancel,
}: {
    fileName: string;
    fileType: 'DXF' | 'SVG';
    width: number;
    height: number;
    onApply(scaleToMm: number): void;
    onCancel(): void;
}) {
    const [unitIndex, setUnitIndex] = useState(0);
    const selected = unitChoices[unitIndex];
    const estimatedWidth = width * selected.scale;
    const estimatedHeight = height * selected.scale;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vector-units-title"
        >
            <section className="w-full max-w-md max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark">
                <h2
                    id="vector-units-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    Check drawing units
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {fileType === 'DXF'
                        ? 'This DXF does not specify its units. Choose the units used when it was drawn so gCAM can size it correctly.'
                        : 'This SVG has no physical size. Choose the units used when it was drawn so gCAM can size it correctly.'}
                </p>
                <label className="mt-4 block text-sm text-slate-700 dark:text-slate-200">
                    Drawing units
                    <select
                        aria-label="Drawing units"
                        value={unitIndex}
                        onChange={(event) =>
                            setUnitIndex(Number(event.currentTarget.value))
                        }
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-robin-800 dark:bg-dark-lighter dark:text-white"
                    >
                        {unitChoices.map((unit, index) => (
                            <option key={unit.label} value={index}>
                                {unit.label}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-600 dark:bg-dark-lighter dark:text-slate-300">
                    Estimated drawing size:{' '}
                    <strong className="text-slate-900 dark:text-white">
                        {estimatedWidth.toFixed(1)} ×{' '}
                        {estimatedHeight.toFixed(1)} mm
                    </strong>
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
                        onClick={() => onApply(selected.scale)}
                        className="rounded bg-robin-600 px-3 py-2 text-sm font-medium text-white hover:bg-robin-700"
                    >
                        Import drawing
                    </button>
                </div>
            </section>
        </div>
    );
}
