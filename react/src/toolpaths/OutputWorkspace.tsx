/**
 * Purpose: Implementation module for OutputWorkspace in the react domain.
 */
import { Box } from 'lucide-react';
import { GcodeViewer3DView } from '../components/GcodeViewer3DView';
import { GcodePreview } from '../components/GcodePreview';
import type { JobStock } from '../job/stock';

interface OutputWorkspaceProps {
    toolpaths: Record<string, unknown>[];
    gcode: string;
    fileName: string;
    darkMode: boolean;
    stock: JobStock;
}

/** Preview the generated G-code without rebuilding stock geometry. */
export function OutputWorkspace({
    toolpaths,
    gcode,
    fileName,
    darkMode,
}: OutputWorkspaceProps) {
    const title = 'G-code preview';
    const emptyText = 'Add a toolpath to preview G-code';
    return (
        <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Box size={18} className="text-robin-400" />
                <span className="font-medium text-slate-900 dark:text-white">
                    {title}
                </span>
                <span className="text-xs text-slate-500">
                    {toolpaths.length
                        ? `${toolpaths.length} toolpath${toolpaths.length === 1 ? '' : 's'}`
                        : emptyText}
                </span>
            </div>
            <div className="flex-1 min-h-0">
                <GcodeViewer3DView darkMode={darkMode} gcode={gcode} />
            </div>
            <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <GcodePreview gcode={gcode} fileName={fileName} />
            </div>
        </main>
    );
}
