/** A single rotary design surface with the familiar toolpath settings rail. */
import { useState } from 'react';
import { GcodeExportButton } from '../../toolpaths/GcodeExportButton';
import type { UnitSystem } from '../../lib/units';
import type { MaterialId } from '../../cutting-parameters/types';
import type { UseRotaryState } from '../useRotaryState';
import { RotaryShapePane } from './RotaryShapePane';
import { RotaryViewport } from './RotaryViewport';
import type { useRotaryExport } from './useRotaryExport';
import { RotaryToolpathSidebar } from './RotaryToolpathSidebar';

export function RotaryPanel({
    rotary: R,
    units,
    darkMode,
    material,
    machineProfileId,
    onMaterialChange,
    output,
    onPreview,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
    darkMode: boolean;
    material: MaterialId;
    machineProfileId: string;
    onMaterialChange(material: MaterialId): void;
    output: ReturnType<typeof useRotaryExport>;
    onPreview?(): void;
}) {
    const [showMachine, setShowMachine] = useState(true);
    return (
        <main
            className="rotary-workspace bg-slate-100 dark:bg-slate-800"
            aria-label="Rotary workspace"
        >
            <div className="rotary-single-page">
                <section
                    className="rotary-design-card rounded-lg border border-slate-200 bg-white dark:border-robin-900 dark:bg-dark"
                    aria-label="Rotary design"
                >
                    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-robin-900">
                        <div
                            className="ml-auto flex flex-wrap items-center gap-3 text-xs"
                            aria-label="Preview layers"
                        >
                            {(
                                [
                                    ['Stock', R.showStock, R.setShowStock],
                                    ['Toolpath', R.showPath, R.setShowPath],
                                    ['Machine', showMachine, setShowMachine],
                                ] as const
                            ).map(([label, checked, change]) => (
                                <label
                                    key={label}
                                    className="flex min-h-9 items-center gap-1.5"
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) =>
                                            change(event.target.checked)
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </header>
                    <RotaryViewport
                        samples={R.samples}
                        stock={R.stock}
                        moves={R.toolpathEditorOpen ? R.draftMoves : R.moves}
                        showStock={R.showStock}
                        showPath={R.showPath}
                        showMachine={showMachine}
                        darkMode={darkMode}
                        stl={R.stlMesh}
                        mode={R.mode}
                    />
                    <RotaryShapePane
                        rotary={R}
                        units={units}
                        darkMode={darkMode}
                    />
                </section>
                <aside
                    className="rotary-toolpath-sidebar rounded-lg border border-slate-200 bg-white dark:border-robin-900 dark:bg-dark"
                    aria-label="Rotary toolpath settings"
                >
                    <div className="rotary-toolpath-fields p-3 space-y-3 text-sm">
                        <RotaryToolpathSidebar
                            rotary={R}
                            units={units}
                            darkMode={darkMode}
                            material={material}
                            machineProfileId={machineProfileId}
                            onMaterialChange={onMaterialChange}
                            output={output}
                            onPreview={onPreview}
                        />
                    </div>
                    {!R.toolpathEditorOpen && (
                        <footer
                            aria-label="Rotary actions"
                            className="shrink-0 border-t border-slate-200 p-3 dark:border-robin-900"
                        >
                            <GcodeExportButton
                                outputSettings={R.outputSettings}
                                gcode={output.ready ? R.gcode : ''}
                                fileName={R.name}
                                stack={[]}
                                programs={output.ready ? R.programs : []}
                                units={units}
                                emitArcs={false}
                            />
                        </footer>
                    )}
                </aside>
            </div>
        </main>
    );
}
