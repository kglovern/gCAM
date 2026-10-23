/** Share the tool rack and cutting recipe UI with the main toolpath form. */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ToolSelectionFields } from '../../toolpaths/ToolSelectionFields';
import { CuttingRecipeFields } from '../../toolpaths/CuttingRecipeFields';
import { isConfigured, loadSlots, type ToolSlot } from '../../tools/library';
import {
    DEFAULT_MACHINE_PROFILE,
    machineProfileById,
} from '../../cutting-parameters/machines';
import { recommendCuttingParameters } from '../../cutting-parameters/recommend';
import type { MaterialId } from '../../cutting-parameters/types';
import type { UnitSystem } from '../../lib/units';
import type { UseRotaryState } from '../useRotaryState';
import { mapSlotType } from './fields/ToolFields';

export function RotaryCuttingFields({
    rotary: R,
    units,
    material,
    machineProfileId,
    children,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
    material: MaterialId;
    machineProfileId: string;
    children?: ReactNode;
}) {
    const [slots, setSlots] = useState(() => loadSlots(window.localStorage));
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [librarySlot, setLibrarySlot] = useState<number | null>(null);
    const compatible = slots.filter((slot) =>
        ['flat', 'ball', 'ballnose', 'v-bit'].includes(slot.toolType),
    );
    const activeSlot = compatible.find((slot) => slot.slot === R.tool.slotNum);
    const recommendation = useMemo(() => {
        if (
            !activeSlot ||
            !isConfigured(activeSlot) ||
            !(activeSlot.cuttingDiameterMm! > 0) ||
            !(activeSlot.flutes! > 0)
        )
            return null;
        return recommendCuttingParameters({
            material,
            machine:
                machineProfileById(machineProfileId) ?? DEFAULT_MACHINE_PROFILE,
            operation: 'profile-outside',
            stockDepthMm: R.stock.diameter / 2,
            cutter: {
                toolType: activeSlot.toolType,
                diameterMm: activeSlot.cuttingDiameterMm!,
                flutes: activeSlot.flutes!,
                cuttingLengthMm: activeSlot.cuttingLengthMm,
                cutterMaterial: activeSlot.cutterMaterial,
                fluteAngleDeg: activeSlot.fluteAngleDeg,
            },
        });
    }, [activeSlot, material, machineProfileId, R.stock.diameter]);
    useEffect(() => {
        // Imported jobs without this flag retain their saved cutting values.
        if (!recommendation || R.tool.manualCuttingParams !== false) return;
        const { feedMmMin, plungeMmMin, rpm, passDepthMm } = recommendation;
        if (
            R.tool.feed !== feedMmMin ||
            R.tool.plunge !== plungeMmMin ||
            R.tool.spindle !== rpm
        )
            R.setTool((tool) => ({
                ...tool,
                feed: feedMmMin,
                plunge: plungeMmMin,
                spindle: rpm,
            }));
        if (R.opsBase.roughStep !== passDepthMm)
            R.setOpsBase((ops) => ({ ...ops, roughStep: passDepthMm }));
    }, [recommendation, R.tool, R.opsBase.roughStep, R.setTool, R.setOpsBase]);
    const applySlot = (slot: ToolSlot) => {
        R.pushHistory();
        R.setTool((tool) => ({
            ...tool,
            slotNum: slot.slot,
            type: mapSlotType(slot.toolType),
            dia: slot.cuttingDiameterMm ?? tool.dia,
            manualCuttingParams: false,
        }));
        setSlots(loadSlots(window.localStorage));
    };
    return (
        <>
            <section className="space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tool selection
                </h3>
                <ToolSelectionFields
                    slots={compatible}
                    hasAnyConfiguredTool={slots.some(isConfigured)}
                    slotNum={R.tool.slotNum ?? 0}
                    units={units}
                    libraryOpen={libraryOpen}
                    librarySlot={librarySlot}
                    onOpenLibrary={() => {
                        setLibrarySlot(null);
                        setLibraryOpen(true);
                    }}
                    onSetupTools={() => {
                        const empty = slots.find((slot) => !isConfigured(slot));
                        setLibrarySlot(empty?.slot ?? null);
                        if (empty)
                            R.setTool((tool) => ({
                                ...tool,
                                slotNum: empty.slot,
                            }));
                        setLibraryOpen(true);
                    }}
                    onSelectSlot={(number) => {
                        const slot = slots.find((item) => item.slot === number);
                        if (slot && isConfigured(slot)) applySlot(slot);
                        else {
                            R.setTool((tool) => ({ ...tool, slotNum: number }));
                            setLibrarySlot(number);
                            setLibraryOpen(true);
                        }
                    }}
                    onCloseLibrary={() => {
                        setLibraryOpen(false);
                        setLibrarySlot(null);
                        setSlots(loadSlots(window.localStorage));
                    }}
                    onConfiguredSlot={applySlot}
                />
            </section>
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Toolpath settings
                </h3>
                <CuttingRecipeFields
                    recommendation={recommendation}
                    units={units}
                    manual={R.tool.manualCuttingParams !== false}
                    onManualChange={(manual) => {
                        R.pushHistory();
                        R.setTool((tool) => ({
                            ...tool,
                            manualCuttingParams: manual,
                        }));
                    }}
                    feedRate={R.tool.feed}
                    onFeedRateChange={(feed) =>
                        R.setTool((tool) => ({ ...tool, feed }))
                    }
                    plungeRate={R.tool.plunge}
                    onPlungeRateChange={(plunge) =>
                        R.setTool((tool) => ({ ...tool, plunge }))
                    }
                    spindle={R.tool.spindle}
                    onSpindleChange={(spindle) =>
                        R.setTool((tool) => ({ ...tool, spindle }))
                    }
                    maxDepth={R.opsBase.roughStep}
                    maxDepthLabel="Max depth per pass"
                    onMaxDepthChange={(roughStep) =>
                        R.setOpsBase((ops) => ({ ...ops, roughStep }))
                    }
                />
                {children}
            </section>
        </>
    );
}
