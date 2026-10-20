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
    return (
        <div className="space-y-2">
            <pre className="max-h-28 overflow-auto no-scrollbar rounded bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-robin-900 p-2 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {gcode ||
                    'Import vectors and add a toolpath to generate G-code.'}
            </pre>
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
