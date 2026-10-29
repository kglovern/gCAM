/**
 * Purpose: Implementation module for CuttingFields in the react domain.
 */
import type { Operation } from '../lib/engine';
import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';

interface CuttingFieldsProps {
    operation: Operation;
    units: UnitSystem;
    overlap: number;
    onOverlapChange(value: number): void;
    trochoid: boolean;
    onTrochoidChange(value: boolean): void;
    engagement: number;
    onEngagementChange(value: number): void;
    helicalEntry: boolean;
    onHelicalEntryChange(value: boolean): void;
    tabsEnabled: boolean;
    onTabsEnabledChange(value: boolean): void;
    tabWidth: number;
    onTabWidthChange(value: number): void;
    tabHeight: number;
    onTabHeightChange(value: number): void;
}

/** Pocket, profile and tab controls shared by cutting operations. */
export function CuttingFields({
    operation,
    units,
    overlap,
    onOverlapChange,
    trochoid,
    onTrochoidChange,
    engagement,
    onEngagementChange,
    helicalEntry,
    onHelicalEntryChange,
    tabsEnabled,
    onTabsEnabledChange,
    tabWidth,
    onTabWidthChange,
    tabHeight,
    onTabHeightChange,
}: CuttingFieldsProps) {
    const isProfile =
        operation === 'profile-outside' || operation === 'profile-inside';
    const supportsTabs = isProfile || operation === 'laser-cut';
    return (
        <>
            {operation === 'pocket' && (
                <label className="space-y-1">
                    <span className="text-slate-500 dark:text-slate-400">
                        Overlap %
                    </span>
                    <input
                        type="number"
                        min={0}
                        max={95}
                        step={1}
                        value={overlap}
                        onChange={(event) =>
                            onOverlapChange(Number(event.target.value))
                        }
                        className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                    />
                </label>
            )}
            {(isProfile || operation === 'pocket') && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                        type="checkbox"
                        checked={trochoid}
                        onChange={(event) =>
                            onTrochoidChange(event.target.checked)
                        }
                        className="accent-robin-500"
                    />
                    Trochoidal clearing
                    {trochoid && (
                        <span className="inline-flex items-center gap-1">
                            <input
                                type="number"
                                min={2}
                                max={40}
                                value={engagement}
                                onChange={(event) =>
                                    onEngagementChange(
                                        Number(event.target.value),
                                    )
                                }
                                className="w-14 rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-1 py-0.5 text-slate-900 dark:text-white"
                            />
                            %
                        </span>
                    )}
                </label>
            )}
            {(isProfile || operation === 'pocket') && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                        type="checkbox"
                        checked={helicalEntry}
                        onChange={(event) =>
                            onHelicalEntryChange(event.target.checked)
                        }
                        className="accent-robin-500"
                    />
                    Helical contour entry
                </label>
            )}
            {supportsTabs && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                        type="checkbox"
                        checked={tabsEnabled}
                        onChange={(event) =>
                            onTabsEnabledChange(event.target.checked)
                        }
                    />
                    Holding tabs
                </label>
            )}
            {supportsTabs && tabsEnabled && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Tab width ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={3}
                            maxMm={50}
                            valueMm={tabWidth}
                            onChangeMm={onTabWidthChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Tab height ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={tabHeight}
                            onChangeMm={onTabHeightChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
        </>
    );
}
