import { useMediaQuery } from '../hooks/useMediaQuery';
/**
 * Purpose: Implementation module for GcodePreview in the components domain.
 */
export function GcodePreview({
    gcode,
    fileName,
}: {
    gcode: string;
    fileName: string;
}) {
    const compact = useMediaQuery('(max-width: 767px), (max-height: 600px)');
    const download = () => {
        if (!gcode) return;
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const base = (fileName || 'gcam').replace(/\.[^.]+$/, '');
        // camcanvas always exported GRBL as fixed .nc
        a.download = `${base}.nc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-2">
            <details open={!compact}>
                <summary className="cursor-pointer rounded py-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    G-code
                    {gcode
                        ? ` · ${gcode.split('\n').length.toLocaleString()} lines`
                        : ''}
                </summary>
                <pre className="max-h-28 overflow-auto no-scrollbar rounded bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-robin-900 p-2 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {gcode ||
                        'Import vectors and add a toolpath to generate G-code.'}
                </pre>
            </details>
            <button
                onClick={download}
                disabled={!gcode}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    gcode
                        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'border-slate-300 text-slate-500 dark:border-robin-700 dark:text-slate-400'
                } disabled:cursor-not-allowed disabled:opacity-60`}
            >
                Save GCODE
            </button>
        </div>
    );
}
