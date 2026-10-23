import { RotarySettingsBoundary } from './RotarySettingsBoundary';
import type { UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import { OpsFields } from './fields/OpsFields';
import { PommelFields } from './fields/PommelFields';
import { ChecksList } from './ChecksGcode';

export function RotaryToolpathsPane({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    return (
        <div className="space-y-3">
            <RotarySettingsBoundary onBeforeChange={R.pushHistory}>
                <OpsFields
                    units={units}
                    operation={R.operation}
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
            {(R.operation === 'rough' || R.operation === 'finish') && (
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
            )}

            <ChecksList
                flags={
                    R.mode === 'stl' && !R.stlMesh
                        ? [
                              {
                                  level: 'e',
                                  msg: 'Import an STL before generating this job.',
                              },
                              ...R.draftFlags,
                          ]
                        : R.draftFlags
                }
            />
        </div>
    );
}
