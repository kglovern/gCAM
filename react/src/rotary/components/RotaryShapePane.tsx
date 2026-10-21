import { useState } from 'react';
import { UnitInput } from '../../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../../lib/units';
import { TEMPLATES } from '../engine/profileModel';
import type { ProfilePointType } from '../engine/types';
import type { UseRotaryState } from '../useRotaryState';
import { ProfileEditorView } from './ProfileEditorView';
import { StlPane } from './StlPane';

const action =
    'min-h-11 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-40 dark:border-robin-700';
export function RotaryShapePane({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    const [snap, setSnap] = useState(true);
    const [importError, setImportError] = useState('');
    const [importing, setImporting] = useState(false);
    const importModel = async (file: File) => {
        setImporting(true);
        setImportError('');
        try {
            await R.importStlFile(file);
        } catch (error) {
            setImportError(
                error instanceof Error
                    ? error.message
                    : 'Could not read this STL.',
            );
        } finally {
            setImporting(false);
        }
    };
    const point = R.points[R.sel];
    return (
        <section
            className="rotary-shape rounded-lg border border-slate-200 bg-white dark:border-robin-900 dark:bg-dark"
            aria-label="Rotary shape"
        >
            <div
                className="flex gap-1 border-b border-slate-200 p-1.5 dark:border-robin-900"
                role="group"
                aria-label="Shape source"
            >
                {(['profile', 'stl'] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        aria-pressed={R.mode === mode}
                        onClick={() => R.setMode(mode)}
                        className={`${action} flex-1 ${R.mode === mode ? 'bg-robin-500 text-white border-robin-500' : ''}`}
                    >
                        {mode === 'profile'
                            ? 'Draw a profile'
                            : 'Import an STL'}
                    </button>
                ))}
            </div>
            {importing && (
                <p role="status" className="p-3 text-sm">
                    Reading STL...
                </p>
            )}
            {importError && (
                <p
                    role="alert"
                    className="p-3 text-sm text-red-600 dark:text-red-400"
                >
                    {importError}
                </p>
            )}
            {R.mode === 'profile' ? (
                <>
                    <div className="flex flex-wrap gap-2 p-3">
                        <label className="text-sm flex min-w-0 flex-1 items-center gap-2">
                            Template
                            <select
                                aria-label="Load template"
                                value=""
                                onChange={(event) => {
                                    if (event.target.value)
                                        R.loadTemplate(event.target.value);
                                }}
                                className={`${action} min-w-0 flex-1 bg-transparent`}
                            >
                                <option value="">
                                    Choose a starting shape
                                </option>
                                {Object.entries(TEMPLATES).map(
                                    ([key, template]) => (
                                        <option value={key} key={key}>
                                            {template.label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>
                    </div>
                    <ProfileEditorView
                        points={R.points}
                        stock={R.stock}
                        snap={snap}
                        sel={R.sel}
                        onSelect={R.setSel}
                        onLive={R.livePoints}
                        onDragEnd={R.healPoints}
                        onInsert={R.insertNodeAt}
                        onDeleteKey={() => {
                            if (R.sel >= 0 && R.points.length > 2)
                                R.deletePoint(R.sel);
                        }}
                        onNudge={R.nudgePoint}
                    />
                    <div className="shrink-0 border-t border-slate-200 p-2 dark:border-robin-900 space-y-2">
                        {point && (
                            <div className="grid grid-cols-3 gap-2">
                                {(
                                    [
                                        ['x', 'Position X', point.x],
                                        ['r', 'Radius', point.r],
                                        ['d', 'Diameter', point.r * 2],
                                    ] as const
                                ).map(([key, label, value]) => (
                                    <label
                                        key={key}
                                        className="text-xs text-slate-500 dark:text-slate-400"
                                    >
                                        {label} ({lengthUnit(units)})
                                        <UnitInput
                                            units={units}
                                            valueMm={value}
                                            onChangeMm={(value) =>
                                                R.setPointValues(key, value)
                                            }
                                            stepMm={0.1}
                                            aria-label={
                                                label === 'Position X'
                                                    ? 'Node X'
                                                    : `Node ${label.toLowerCase()}`
                                            }
                                            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-transparent px-2 text-sm text-slate-900 dark:border-robin-700 dark:text-white"
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="min-h-11 flex items-center gap-2 text-sm mr-auto">
                                <input
                                    type="checkbox"
                                    checked={snap}
                                    onChange={(event) =>
                                        setSnap(event.target.checked)
                                    }
                                />
                                Snap 1 mm
                            </label>
                            {point && (
                                <>
                                    <select
                                        aria-label="Point type"
                                        value={point.type}
                                        onChange={(event) =>
                                            R.setPointType(
                                                event.target
                                                    .value as ProfilePointType,
                                            )
                                        }
                                        className={`${action} bg-transparent`}
                                    >
                                        <option value="corner">Corner</option>
                                        <option value="smooth">Smooth</option>
                                        <option value="sym">Symmetric</option>
                                    </select>
                                    <button
                                        className={action}
                                        disabled={R.points.length <= 2}
                                        onClick={() => R.deletePoint(R.sel)}
                                    >
                                        Delete point
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <StlPane
                    stlName={R.stlMesh?.name ?? null}
                    stlInfo={R.stlInfo}
                    compR={R.compR}
                    onImportStl={(file) => {
                        void importModel(file);
                    }}
                />
            )}
        </section>
    );
}
