import { RotarySettingsBoundary } from './RotarySettingsBoundary';
import type { UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import { OpsFields } from './fields/OpsFields';
import { PommelFields } from './fields/PommelFields';
import { ChecksList, GcodePanel } from './ChecksGcode';

export function RotaryToolpathsPane({
    rotary: R,
    units,
    ready,
    onDownload,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
    ready: boolean;
    onDownload(): void;
}) {
    return (
        <div className="space-y-3">
            <RotarySettingsBoundary onBeforeChange={R.pushHistory}>
                <OpsFields
                    units={units}
                    ops={{ ...R.opsBase, pommels: R.pommels, compR: R.compR }}
                    compR={R.compR}
                    onPatch={(patch) =>
                        R.setOpsBase((ops) => ({
                            ...ops,
                            ...patch,
                            groove: { ...ops.groove, ...patch.groove },
                            part: { ...ops.part, ...patch.part },
                        }))
                    }
                />
            </RotarySettingsBoundary>
            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <summary className="min-h-11 flex items-center text-sm font-medium cursor-pointer">
                    Square sections / pommels ({R.pommels.length})
                </summary>
                <PommelFields
                    units={units}
                    pommels={R.pommels}
                    onAdd={(x0, x1, w) => {
                        const start = Math.max(
                            0,
                            Math.min(x0, x1, R.stock.length),
                        );
                        const end = Math.max(
                            0,
                            Math.min(Math.max(x0, x1), R.stock.length),
                        );
                        if (!Number.isFinite(w) || w <= 0 || end - start < 2)
                            return;
                        R.pushHistory();
                        R.setPommels((list) =>
                            [...list, { x0: start, x1: end, w }].sort(
                                (a, b) => a.x0 - b.x0,
                            ),
                        );
                    }}
                    onRemove={(index) => {
                        R.pushHistory();
                        R.setPommels((list) =>
                            list.filter((_, i) => i !== index),
                        );
                    }}
                />
            </details>
            <ChecksList
                flags={
                    R.mode === 'stl' && !R.stlMesh
                        ? [
                              {
                                  level: 'e',
                                  msg: 'Import an STL in Shape before generating this job.',
                              },
                              ...R.flags,
                          ]
                        : R.flags
                }
            />
            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <summary className="min-h-11 flex items-center text-sm font-medium cursor-pointer">
                    G-code preview {ready ? '(ready)' : '(not generated)'}
                </summary>
                <GcodePanel
                    gcode={ready ? R.gcode : ''}
                    statsLine={`${R.moves.length.toLocaleString()} moves`}
                    onDownload={onDownload}
                    canDownload={ready}
                />
            </details>
        </div>
    );
}
