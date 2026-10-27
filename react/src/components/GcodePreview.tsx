import { useMediaQuery } from '../hooks/useMediaQuery';
import { useMemo } from 'react';
/**
 * Purpose: Implementation module for GcodePreview in the components domain.
 */
import { SendToGsenderButton } from '../integrations/gsender/SendToGsenderButton';
import { downloadGcode } from '../toolpaths/exportGcode';

export function GcodePreview({
    gcode,
    fileName,
}: {
    gcode: string;
    fileName: string;
}) {
    const compact = useMediaQuery('(max-width: 767px), (max-height: 600px)');
    const preview = useMemo(
        () => gcode.slice(0, 20000).split('\n', 201).slice(0, 200).join('\n'),
        [gcode],
    );
    const truncated = preview.length < gcode.length;
    return (
        <div className="space-y-2">
            <details open={!compact}>
                <summary className="cursor-pointer rounded py-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    G-code
                    {gcode
                        ? truncated
                            ? ' · preview'
                            : ` · ${preview.split('\n').length.toLocaleString()} lines`
                        : ''}
                </summary>
                <pre className="max-h-28 overflow-auto no-scrollbar rounded bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-robin-900 p-2 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {preview ||
                        'Import vectors and add a toolpath to generate G-code.'}
                    {truncated &&
                        '\n… Preview truncated; export includes the full file.'}
                </pre>
            </details>
            <button
                onClick={() => downloadGcode(gcode, fileName)}
                disabled={!gcode}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    gcode
                        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'border-slate-300 text-slate-500 dark:border-robin-700 dark:text-slate-400'
                } disabled:cursor-not-allowed disabled:opacity-60`}
            >
                Save GCODE
            </button>
            <SendToGsenderButton gcode={gcode} fileName={fileName} />
        </div>
    );
}
