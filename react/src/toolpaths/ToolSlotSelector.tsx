/**
 * Purpose: Implementation module for ToolSlotSelector in the react domain.
 */
import { Settings } from 'lucide-react';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import { isConfigured, type ToolSlot } from '../tools/library';
import { ImagePicker } from '../tools/ImagePicker';

interface ToolSlotSelectorProps {
    slots: ToolSlot[];
    slotNum: number;
    units: UnitSystem;
    hasAnyConfiguredTool: boolean;
    onSelect: (slot: number) => void;
    onOpenLibrary: () => void;
    onSetupTools: () => void;
    slotIssue?: (slot: ToolSlot) => string | null;
}

/** The tool-rack chooser is shared form chrome, not operation parameters. */
export function ToolSlotSelector({
    slots,
    slotNum,
    units,
    hasAnyConfiguredTool,
    onSelect,
    onOpenLibrary,
    onSetupTools,
    slotIssue,
}: ToolSlotSelectorProps) {
    const hasCompatibleTool = slots.some(isConfigured);

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 text-sm">
                    Tool library
                </span>
                <button
                    type="button"
                    onClick={onOpenLibrary}
                    title="Open tool library"
                    aria-label="Open tool library"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-robin-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-lighter hover:text-slate-900 dark:hover:text-white touch-manipulation"
                >
                    <Settings size={18} />
                </button>
            </div>
            {hasCompatibleTool ? (
                <ImagePicker
                    ariaLabel="Tool library slot"
                    value={String(slotNum)}
                    onChange={(value) => onSelect(Number(value))}
                    className="w-full rounded-lg bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="Select a tool"
                    groups={[
                        {
                            options: slots.map((slot) => ({
                                id: String(slot.slot),
                                label: `T${slot.slot} — ${slot.name || 'empty'}`,
                                disabled: Boolean(slotIssue?.(slot)),
                                detail:
                                    slotIssue?.(slot) ??
                                    (slot.cuttingDiameterMm != null
                                        ? `Ø${displayValue(slot.cuttingDiameterMm, units)}${lengthUnit(units)}`
                                        : 'Not configured'),
                                image: slot.image,
                            })),
                        },
                    ]}
                />
            ) : hasAnyConfiguredTool ? (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                        No matching tool set up
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        Your library has tools, but none match this operation.
                        Set up a compatible cutter or review your tool library.
                    </p>
                    <button
                        type="button"
                        onClick={onOpenLibrary}
                        className="w-full rounded-md bg-robin-600 px-3 py-2 text-sm font-medium text-white hover:bg-robin-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-robin-500"
                    >
                        Review tools
                    </button>
                </div>
            ) : (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                        No tools set up yet
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        Add the cutter fitted to your machine so gCAM can choose
                        suitable cutting settings.
                    </p>
                    <button
                        type="button"
                        onClick={onSetupTools}
                        className="w-full rounded-md bg-robin-600 px-3 py-2 text-sm font-medium text-white hover:bg-robin-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-robin-500"
                    >
                        Set up your tools
                    </button>
                </div>
            )}
        </div>
    );
}
