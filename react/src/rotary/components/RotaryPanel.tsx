/** Rotary workspace composition. Geometry and machining remain in the rotary engine. */
import { useState } from 'react';
import { ChevronRight, Download, Undo2, Redo2 } from 'lucide-react';
import { formatLength, type UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import { RotarySetupPane } from './RotarySetupPane';
import { RotaryShapePane } from './RotaryShapePane';
import { RotaryToolpathsPane } from './RotaryToolpathsPane';
import { RotaryViewport } from './RotaryViewport';
import { useRotaryExport } from './useRotaryExport';

const steps = ['Setup', 'Shape', 'Toolpaths'] as const;
const action =
    'min-h-11 rounded-md border border-slate-300 px-3 text-sm dark:border-robin-700 disabled:opacity-40';
export function RotaryPanel({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    const [step, setStep] = useState(0);
    const output = useRotaryExport(R);
    const warnings = R.flags.filter((flag) => flag.level === 'w').length;
    return (
        <main
            className="rotary-workspace bg-slate-100 dark:bg-slate-800"
            aria-label="Rotary workspace"
        >
            <header className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-robin-900 dark:bg-dark">
                <div className="mr-auto">
                    <h1 className="text-base font-semibold">Rotary</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Vortex A-axis · {formatLength(R.stock.diameter, units)}{' '}
                        diameter × {formatLength(R.stock.length, units)} long
                    </p>
                </div>
                <input
                    onFocus={R.pushHistory}
                    value={R.name}
                    onChange={(event) => R.setName(event.target.value)}
                    maxLength={80}
                    aria-label="Design name"
                    placeholder="Design name"
                    className="min-h-11 w-40 min-w-0 rounded-md border border-slate-300 bg-transparent px-2 text-sm dark:border-robin-700"
                />
                <button
                    className={`${action} flex items-center justify-center`}
                    aria-label="Undo rotary change"
                    disabled={!R.canUndo}
                    onClick={R.undo}
                >
                    <Undo2 size={18} />
                </button>
                <button
                    className={`${action} flex items-center justify-center`}
                    aria-label="Redo rotary change"
                    disabled={!R.canRedo}
                    onClick={R.redo}
                >
                    <Redo2 size={18} />
                </button>
            </header>
            <div
                role="tablist"
                aria-label="Rotary workflow"
                className="flex shrink-0 gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-robin-900 dark:bg-dark"
            >
                {steps.map((name, index) => (
                    <button
                        key={name}
                        id={`rotary-tab-${index}`}
                        role="tab"
                        type="button"
                        aria-selected={step === index}
                        aria-controls={`rotary-step-${index}`}
                        tabIndex={step === index ? 0 : -1}
                        onClick={() => setStep(index)}
                        onKeyDown={(event) => {
                            const next =
                                event.key === 'ArrowRight'
                                    ? (index + 1) % 3
                                    : event.key === 'ArrowLeft'
                                      ? (index + 2) % 3
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? 2
                                          : null;
                            if (next !== null) {
                                event.preventDefault();
                                setStep(next);
                                document
                                    .getElementById(`rotary-tab-${next}`)
                                    ?.focus();
                            }
                        }}
                        className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium ${step === index ? 'bg-robin-500 text-white' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                        <span aria-hidden="true" className="mr-2 opacity-70">
                            {index + 1}
                        </span>
                        {name}
                    </button>
                ))}
            </div>
            <div className="rotary-body">
                <div className="rotary-controls">
                    {steps.map((name, index) => (
                        <section
                            key={name}
                            id={`rotary-step-${index}`}
                            role="tabpanel"
                            aria-labelledby={`rotary-tab-${index}`}
                            hidden={step !== index}
                            tabIndex={0}
                        >
                            {index === 0 ? (
                                <RotarySetupPane rotary={R} units={units} />
                            ) : index === 1 ? (
                                <RotaryShapePane rotary={R} units={units} />
                            ) : (
                                <RotaryToolpathsPane
                                    rotary={R}
                                    units={units}
                                    ready={output.ready}
                                    onDownload={output.download}
                                />
                            )}
                        </section>
                    ))}
                </div>
                <section className="rotary-preview" aria-label="Rotary preview">
                    <div className="flex min-h-11 flex-wrap items-center gap-x-4 px-1 text-sm">
                        <h2 className="mr-auto font-medium">Part preview</h2>
                        <label className="min-h-11 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={R.showStock}
                                onChange={(event) =>
                                    R.setShowStock(event.target.checked)
                                }
                            />
                            Stock
                        </label>
                        <label className="min-h-11 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={R.showPath}
                                onChange={(event) =>
                                    R.setShowPath(event.target.checked)
                                }
                            />
                            Toolpath
                        </label>
                    </div>
                    <RotaryViewport
                        samples={R.samples}
                        stock={R.stock}
                        moves={R.moves}
                        showStock={R.showStock}
                        showPath={R.showPath}
                        stl={R.stlMesh}
                        mode={R.mode}
                        what={`${R.mode === 'stl' ? (R.stlMesh?.name ?? 'No STL loaded') : 'Revolved profile'} · ${R.moves.length.toLocaleString()} moves`}
                    />
                </section>
            </div>
            <footer
                className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-robin-900 dark:bg-dark"
                aria-label="Rotary actions"
            >
                <button
                    onClick={() => setStep(2)}
                    aria-label="Review rotary checks"
                    className={`${action} mr-auto text-left ${output.errors ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}
                >
                    {output.errors
                        ? `${output.errors} issue${output.errors === 1 ? '' : 's'} to fix`
                        : warnings
                          ? `${warnings} warning${warnings === 1 ? '' : 's'} to review`
                          : 'Checks passed'}
                    <span className="ml-2 text-xs">
                        {output.ready ? 'G-code ready' : 'Review before export'}
                    </span>
                </button>
                {step < 2 ? (
                    <button
                        className={`${action} flex items-center gap-2 bg-robin-500 text-white border-robin-500`}
                        onClick={() => setStep(step + 1)}
                    >
                        Continue to {steps[step + 1]}
                        <ChevronRight size={16} />
                    </button>
                ) : (
                    <>
                        <button
                            className={action}
                            disabled={output.errors > 0 || !R.moves.length}
                            onClick={output.generate}
                        >
                            Generate G-code
                        </button>
                        <button
                            className={`${action} flex items-center gap-2 bg-robin-500 border-robin-500 text-white`}
                            disabled={!output.ready}
                            onClick={output.download}
                        >
                            <Download size={16} />
                            Export G-code
                        </button>
                    </>
                )}
            </footer>
        </main>
    );
}
