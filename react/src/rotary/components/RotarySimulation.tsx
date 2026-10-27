import type { ComponentProps } from 'react';
import type { RotaryPanel } from './RotaryPanel';
import { GcodeViewer3DView } from '../../components/GcodeViewer3DView';
import { GcodePreview } from '../../components/GcodePreview';

export function RotarySimulation({
    rotary: R,
    darkMode,
    output,
}: ComponentProps<typeof RotaryPanel>) {
    return (
        <main
            aria-label="Rotary simulation"
            className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-3 bg-slate-100 p-3 dark:bg-slate-800"
        >
            <div className="text-sm font-medium">Rotary toolpath preview</div>
            <div className="flex-1 min-h-0">
                <GcodeViewer3DView
                    gcode={output.ready ? R.gcode : ''}
                    darkMode={darkMode}
                />
            </div>
            {!output.ready && (
                <p role="status" className="text-xs text-slate-500">
                    The current rotary toolpath is not ready.
                </p>
            )}
            <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <GcodePreview
                    gcode={output.ready ? R.gcode : ''}
                    fileName={R.name}
                />
            </div>
        </main>
    );
}
