import { useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { rasterizeSvg } from '../lib/svgRaster';

export function SvgRasterImportModal({
    file,
    onImport,
    onClose,
}: {
    file: File;
    onImport(file: File): Promise<void>;
    onClose(): void;
}) {
    const panel = useRef<HTMLFormElement>(null);
    useDialogFocus(panel, true);
    const [dpi, setDpi] = useState(254);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="svg-raster-title"
        >
            <form
                ref={panel}
                className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark"
                onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    try {
                        await onImport(await rasterizeSvg(file, dpi));
                        onClose();
                    } catch (error) {
                        setError(
                            error instanceof Error
                                ? error.message
                                : 'Could not render SVG.',
                        );
                    } finally {
                        setBusy(false);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape' && !busy) {
                        event.stopPropagation();
                        onClose();
                    }
                }}
            >
                <h2
                    id="svg-raster-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    Open SVG as image
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Keep clipping, masks, fills and gradients for engraving.
                    Shapes become pixels.
                </p>
                <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-300">
                    {file.name}
                </p>
                <label className="mt-4 block text-sm text-slate-700 dark:text-slate-200">
                    Resolution (DPI)
                    <input
                        aria-label="SVG image DPI"
                        type="number"
                        min="25"
                        max="2400"
                        required
                        value={Number.isFinite(dpi) ? dpi : ''}
                        disabled={busy}
                        onChange={(event) =>
                            setDpi(event.currentTarget.valueAsNumber)
                        }
                        className="mt-1 w-full rounded border border-slate-300 bg-transparent p-2"
                    />
                </label>
                <p className="mt-2 text-xs text-slate-500">
                    Uses the SVG document size; files without a physical size
                    use 96 DPI.
                </p>
                {error && (
                    <p role="alert" className="mt-3 text-sm text-red-600">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded border border-slate-300 px-4 py-2 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={busy}
                        type="submit"
                        className="rounded bg-robin-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {busy ? 'Rendering…' : 'Open image'}
                    </button>
                </div>
            </form>
        </div>
    );
}
