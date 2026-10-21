/**
 * Purpose: Implementation module for OutputWorkspace in the react domain.
 */
import { Box } from 'lucide-react';
import {
    CutPreview3DView,
    type PreviewControls,
} from '../components/CutPreview3DView';
import { GcodePreview } from '../components/GcodePreview';
import type { JobStock } from '../job/stock';

interface OutputWorkspaceProps {
    mode: 'preview';
    toolpaths: Record<string, unknown>[];
    gcode: string;
    fileName: string;
    darkMode: boolean;
    stock: JobStock;
    onPreviewControlsChange(controls: PreviewControls | null): void;
}

/** Shared output workspace for simulated cut and parsed G-code views. */
export function OutputWorkspace({
    mode,
    toolpaths,
    gcode,
    fileName,
    darkMode,
    stock,
    onPreviewControlsChange,
}: OutputWorkspaceProps) {
    const title = 'Stock simulation';
    const emptyText = 'Add a toolpath to preview the cut';
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
                <CutPreview3DView
                    toolpaths={toolpaths}
                    darkMode={darkMode}
                    stock={stock}
                    gcode={gcode}
                    onControlsChange={onPreviewControlsChange}
                />
            </div>
            <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <GcodePreview gcode={gcode} fileName={fileName} />
            </div>
        </main>
    );
}
