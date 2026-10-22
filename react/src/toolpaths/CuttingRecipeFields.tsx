/**
 * Purpose: Material selection and readable automatic cutting recommendation.
 */
import type { CuttingRecommendation } from '../cutting-parameters/types';
import { UnitInput } from '../components/UnitInput';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';
import { useState } from 'react';

export function CuttingRecipeFields({
    recommendation,
    units,
    manual,
    onManualChange,
    feedRate,
    onFeedRateChange,
    plungeRate,
    onPlungeRateChange,
    spindle,
    onSpindleChange,
    maxDepth,
    maxDepthLabel,
    onMaxDepthChange,
}: {
    recommendation: CuttingRecommendation | null;
    units: UnitSystem;
    manual: boolean;
    onManualChange: (manual: boolean) => void;
    feedRate: number;
    onFeedRateChange: (value: number) => void;
    plungeRate: number;
    onPlungeRateChange: (value: number) => void;
    spindle: number;
    onSpindleChange: (value: number) => void;
    maxDepth: number;
    maxDepthLabel: string;
    onMaxDepthChange: (value: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draftFeed, setDraftFeed] = useState(feedRate);
    const [draftPlunge, setDraftPlunge] = useState(plungeRate);
    const [draftSpindle, setDraftSpindle] = useState(spindle);
    const [draftMaxDepth, setDraftMaxDepth] = useState(maxDepth);

    const startEditing = () => {
        setDraftFeed(
            manual ? feedRate : (recommendation?.feedMmMin ?? feedRate),
        );
        setDraftPlunge(
            manual ? plungeRate : (recommendation?.plungeMmMin ?? plungeRate),
        );
        setDraftSpindle(manual ? spindle : (recommendation?.rpm ?? spindle));
        setDraftMaxDepth(
            manual ? maxDepth : (recommendation?.passDepthMm ?? maxDepth),
        );
        setEditing(true);
    };

    const displayed = manual
        ? { feed: feedRate, plunge: plungeRate, spindle, maxDepth }
        : recommendation
          ? {
                feed: recommendation.feedMmMin,
                plunge: recommendation.plungeMmMin,
                spindle: recommendation.rpm,
                maxDepth: recommendation.passDepthMm,
            }
          : null;

    return (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-robin-900 dark:bg-dark-lighter/40">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {manual
                        ? 'Manual cutting values'
                        : 'Suggested cutting values'}
                </span>
                {!editing && (
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            aria-expanded={editing}
                            onClick={startEditing}
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark"
                        >
                            Change
                        </button>
                        {manual && (
                            <button
                                type="button"
                                onClick={() => onManualChange(false)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark"
                            >
                                Use suggestions
                            </button>
                        )}
                    </div>
                )}
            </div>
            {!manual && recommendation && (
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Suggested for the selected cutter, material, and machine.
                    Confirm these match the tool actually installed.
                </p>
            )}
            {recommendation ? (
                <div className="text-xs text-slate-600 dark:text-slate-300">
                    <div className="cutting-recipe-values grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                        <span>Feed ({feedUnit(units)})</span>
                        {editing ? (
                            <UnitInput
                                aria-label={`Feed (${feedUnit(units)})`}
                                kind="feed"
                                units={units}
                                valueMm={draftFeed}
                                onChangeMm={setDraftFeed}
                                minMm={1}
                                stepMm={10}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                            />
                        ) : (
                            <span className="text-right">
                                {displayFeed(
                                    displayed?.feed ?? recommendation.feedMmMin,
                                    units,
                                )}
                            </span>
                        )}
                        <span>Plunge ({feedUnit(units)})</span>
                        {editing ? (
                            <UnitInput
                                aria-label={`Plunge (${feedUnit(units)})`}
                                kind="feed"
                                units={units}
                                valueMm={draftPlunge}
                                onChangeMm={setDraftPlunge}
                                minMm={1}
                                stepMm={10}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                            />
                        ) : (
                            <span className="text-right">
                                {displayFeed(
                                    displayed?.plunge ??
                                        recommendation.plungeMmMin,
                                    units,
                                )}
                            </span>
                        )}
                        <span>Spindle (RPM)</span>
                        {editing ? (
                            <input
                                aria-label="Spindle (RPM)"
                                type="number"
                                min={1}
                                step={100}
                                value={draftSpindle}
                                onChange={(event) =>
                                    setDraftSpindle(Number(event.target.value))
                                }
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                            />
                        ) : (
                            <span className="text-right">
                                {(
                                    displayed?.spindle ?? recommendation.rpm
                                ).toLocaleString()}
                            </span>
                        )}
                        <span>
                            {maxDepthLabel} ({lengthUnit(units)})
                        </span>
                        {editing ? (
                            <UnitInput
                                aria-label={`${maxDepthLabel} (${lengthUnit(units)})`}
                                units={units}
                                valueMm={draftMaxDepth}
                                onChangeMm={setDraftMaxDepth}
                                minMm={0.1}
                                stepMm={0.1}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                            />
                        ) : (
                            <span className="text-right">
                                {displayValue(
                                    displayed?.maxDepth ??
                                        recommendation.passDepthMm,
                                    units,
                                )}
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    {editing
                        ? 'No suggestion is available; enter your cutting values.'
                        : 'Choose a catalog tool with diameter and flute count to calculate a recommendation.'}
                </p>
            )}
            {editing && (
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-2 dark:border-robin-900">
                    <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-white dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onFeedRateChange(draftFeed);
                            onPlungeRateChange(draftPlunge);
                            onSpindleChange(draftSpindle);
                            onMaxDepthChange(draftMaxDepth);
                            onManualChange(true);
                            setEditing(false);
                        }}
                        className="rounded bg-robin-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-robin-600"
                    >
                        Apply
                    </button>
                </div>
            )}
        </section>
    );
}
