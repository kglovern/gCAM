import { useCallback, useState } from 'react';
import type { TimedPreview } from '../engine/prepare-timed-preview';
import { DEFAULT_OUTPUT, type OutputSettings } from '../gcode/profiles';
import { LaserTimeEstimate } from './LaserTimeEstimate';
import { LaserJobBoundsPanel } from './LaserJobBounds';
import type { UnitSystem } from '../lib/units';
import type { MachineTravelLimits } from '../cutting-parameters/types';
import type { LaserRotarySetup } from '../cam/laser-rotary.js';
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
    outputSettings?: OutputSettings;
    units?: UnitSystem;
    machineTravelLimits?: MachineTravelLimits;
    laserMax?: number;
    laserRotary?: LaserRotarySetup;
}

/** Preview the generated G-code without rebuilding stock geometry. */
export function OutputWorkspace({
    toolpaths,
    gcode,
    fileName,
    darkMode,
    stock,
    laserMax,
    laserRotary,
    units,
    machineTravelLimits,
    outputSettings,
}: OutputWorkspaceProps) {
    const dwell = (outputSettings ?? DEFAULT_OUTPUT).dwell;
    const [timing, setTiming] = useState<{
        gcode: string;
        dwell: string;
        plan: TimedPreview;
    } | null>(null);
    const setPlan = useCallback(
        (plan: TimedPreview | null) => {
            setTiming(plan ? { gcode, dwell, plan } : null);
        },
        [gcode, dwell],
    );
    const playbackPlan =
        !laserRotary &&
        !toolpaths.some((p) => p.laserRotary) &&
        toolpaths.some((p) => String(p.operation).startsWith('laser-')) &&
        timing?.gcode === gcode &&
        timing.dwell === dwell
            ? timing.plan
            : undefined;
    const title = laserRotary ? 'Unwrapped rotary preview' : 'G-code preview';
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
            {!laserRotary &&
                !toolpaths.some((p) => p.laserRotary) &&
                toolpaths.some((p) =>
                    String(p.operation).startsWith('laser-'),
                ) && (
                    <div className="grid shrink-0 grid-cols-1 items-start gap-2 md:grid-cols-2">
                        <LaserJobBoundsPanel
                            toolpaths={toolpaths}
                            stock={stock}
                            units={units}
                            machineTravelLimits={machineTravelLimits}
                        />
                        {toolpaths.some((p) =>
                            String(p.operation).startsWith('laser-'),
                        ) && (
                            <LaserTimeEstimate
                                gcode={gcode}
                                dwell={dwell}
                                onPlan={setPlan}
                                laserMax={laserMax}
                            />
                        )}
                    </div>
                )}
            <div className="flex-1 min-h-0">
                <GcodeViewer3DView
                    darkMode={darkMode}
                    gcode={gcode}
                    laser={toolpaths.some((p) =>
                        String(p.operation).startsWith('laser-'),
                    )}
                    laserMax={laserMax}
                    laserRotary={laserRotary}
                    timedPreview={playbackPlan}
                />
            </div>
            <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <GcodePreview
                    gcode={gcode}
                    fileName={fileName}
                    outputSettings={outputSettings}
                />
            </div>
        </main>
    );
}
