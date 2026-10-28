import { useState } from 'react';
import { Spline, Box } from 'lucide-react';
import { UnitInput } from '../../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../../lib/units';
import { TEMPLATES, TEMPLATE_GROUPS } from '../engine/profileModel';
import type { ProfilePointType } from '../engine/types';
import type { UseRotaryState } from '../useRotaryState';
import { ProfileEditorView } from './ProfileEditorView';
import { StlPane } from './StlPane';

const action =
    'min-h-11 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-40 dark:border-robin-700';
export function RotaryShapePane({
    rotary: R,
    units,
    darkMode = false,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
    darkMode?: boolean;
}) {
    const templateOptionStyle = {
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        color: darkMode ? '#e2e8f0' : '#0f172a',
    };
    const [snap, setSnap] = useState(true);
    const [profileViewKey, setProfileViewKey] = useState(0);
    const [importError, setImportError] = useState('');
    const [importing, setImporting] = useState(false);
    const importModel = async (
        file: File,
        axis: 'x' | 'y' | 'z' | 'auto' = 'auto',
        center = true,
        scale = 1,
    ) => {
        setImporting(true);
        setImportError('');
        try {
            await R.importStlFile(file, axis, center, scale);
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
        <section className="rotary-shape" aria-label="Rotary shape">
            <div
                className="rotary-source-tabs"
                role="tablist"
                aria-label="Shape source"
                aria-orientation="vertical"
            >
                {(['profile', 'stl'] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        role="tab"
                        id={`rotary-source-${mode}`}
                        tabIndex={R.mode === mode ? 0 : -1}
                        onKeyDown={(event) => {
                            if (
                                [
                                    'ArrowUp',
                                    'ArrowDown',
                                    'Home',
                                    'End',
                                ].includes(event.key)
                            ) {
                                event.preventDefault();
                                const next =
                                    event.key === 'Home'
                                        ? 'profile'
                                        : event.key === 'End'
                                          ? 'stl'
                                          : mode === 'profile'
                                            ? 'stl'
                                            : 'profile';
                                R.setMode(next);
                                document
                                    .getElementById(`rotary-source-${next}`)
                                    ?.focus();
                            }
                        }}
                        aria-selected={R.mode === mode}
                        aria-controls="rotary-source-content"
                        onClick={() => R.setMode(mode)}
                        className={`rotary-source-tab ${R.mode === mode ? 'rotary-source-tab-active' : ''}`}
                    >
                        {mode === 'profile' ? (
                            <Spline size={24} />
                        ) : (
                            <Box size={24} />
                        )}
                        <span>{mode === 'profile' ? 'Profile' : 'STL'}</span>
                    </button>
                ))}
            </div>
            <div
                id="rotary-source-content"
                role="tabpanel"
                aria-labelledby={`rotary-source-${R.mode}`}
                className="rotary-source-content"
            >
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
                        <ProfileEditorView
                            key={`${profileViewKey}:${R.stock.length}:${R.stock.diameter}`}
                            points={R.points}
                            stock={R.stock}
                            snap={snap}
                            darkMode={darkMode}
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
                                <div className="grid grid-cols-3 items-end gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto]">
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
                                    <select
                                        aria-label="Point type"
                                        style={{
                                            colorScheme: darkMode
                                                ? 'dark'
                                                : 'light',
                                        }}
                                        value={point.type}
                                        onChange={(event) =>
                                            R.setPointType(
                                                event.target
                                                    .value as ProfilePointType,
                                            )
                                        }
                                        className={`${action} bg-transparent`}
                                    >
                                        <option
                                            value="corner"
                                            style={templateOptionStyle}
                                        >
                                            Corner
                                        </option>
                                        <option
                                            value="smooth"
                                            style={templateOptionStyle}
                                        >
                                            Smooth
                                        </option>
                                        <option
                                            value="sym"
                                            style={templateOptionStyle}
                                        >
                                            Symmetric
                                        </option>
                                    </select>
                                    <button
                                        className={action}
                                        disabled={R.points.length <= 2}
                                        onClick={() => R.deletePoint(R.sel)}
                                    >
                                        Delete point
                                    </button>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="min-h-11 flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={snap}
                                        onChange={(event) =>
                                            setSnap(event.target.checked)
                                        }
                                    />
                                    Snap 1 mm
                                </label>
                                <label className="text-sm flex min-w-0 items-center gap-2">
                                    Template
                                    <select
                                        aria-label="Load template"
                                        style={{
                                            colorScheme: darkMode
                                                ? 'dark'
                                                : 'light',
                                        }}
                                        value=""
                                        onChange={(event) => {
                                            if (!event.target.value) return;
                                            try {
                                                R.loadTemplate(
                                                    event.target.value,
                                                );
                                                setImportError('');
                                                setProfileViewKey(
                                                    (value) => value + 1,
                                                );
                                            } catch (error) {
                                                setImportError(
                                                    error instanceof Error
                                                        ? error.message
                                                        : 'Template stock sizing failed.',
                                                );
                                            }
                                        }}
                                        className={`${action} min-w-0 bg-transparent`}
                                    >
                                        <option
                                            value=""
                                            style={templateOptionStyle}
                                        >
                                            Choose a starting shape
                                        </option>
                                        {TEMPLATE_GROUPS.map((group) => (
                                            <optgroup
                                                label={group}
                                                key={group}
                                                style={templateOptionStyle}
                                            >
                                                {Object.entries(TEMPLATES)
                                                    .filter(
                                                        ([, template]) =>
                                                            template.group ===
                                                            group,
                                                    )
                                                    .map(([key, template]) => (
                                                        <option
                                                            style={
                                                                templateOptionStyle
                                                            }
                                                            value={key}
                                                            key={key}
                                                        >
                                                            {template.label}
                                                        </option>
                                                    ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </>
                ) : (
                    <StlPane
                        stlName={R.stlMesh?.name ?? null}
                        stlInfo={R.stlInfo}
                        compR={R.compR}
                        onImportStl={(file, axis, center) => {
                            void importModel(file, axis, center);
                        }}
                    />
                )}
            </div>
        </section>
    );
}
