import { RotarySettingsBoundary } from './RotarySettingsBoundary';
import { useState } from 'react';
import type { UnitSystem } from '../../lib/units';
import { ToolLibraryModal } from '../../tools/ToolLibraryModal';
import { isConfigured, loadSlots, type ToolSlot } from '../../tools/library';
import type { UseRotaryState } from '../useRotaryState';
import { ToolFields, mapSlotType } from './fields/ToolFields';

export function RotarySetupPane({
    rotary: R,
    units,
}: {
    rotary: UseRotaryState;
    units: UnitSystem;
}) {
    const [slots, setSlots] = useState(() => loadSlots(window.localStorage));
    const [libraryOpen, setLibraryOpen] = useState(false);
    const applySlot = (slot: ToolSlot) =>
        R.setTool((tool) => ({
            ...tool,
            slotNum: slot.slot,
            type: mapSlotType(slot.toolType),
            dia: slot.cuttingDiameterMm ?? tool.dia,
        }));
    return (
        <RotarySettingsBoundary onBeforeChange={R.pushHistory}>
            <div className="space-y-3">
                <ToolFields
                    tool={R.tool}
                    units={units}
                    slots={slots}
                    onPatch={(patch) =>
                        R.setTool((tool) => ({ ...tool, ...patch }))
                    }
                    onSelectSlot={(number) => {
                        const slot = slots.find((slot) => slot.slot === number);
                        if (slot && isConfigured(slot)) applySlot(slot);
                    }}
                    onOpenLibrary={() => setLibraryOpen(true)}
                />
                <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                    <summary className="min-h-11 flex items-center cursor-pointer text-sm font-medium">
                        Machine setup in gSender
                    </summary>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
                        <li>
                            Hold at least 19 mm of stock in the chuck. Support
                            long stock with the tailstock.
                        </li>
                        <li>
                            Align Y, enable Rotary mode, and probe Rotary Z at
                            the axis centreline.
                        </li>
                        <li>Zero X on the chuck side, clear of the jaws.</li>
                    </ol>
                </details>
                <ToolLibraryModal
                    isOpen={libraryOpen}
                    onClose={() => setLibraryOpen(false)}
                    units={units}
                    onSlotChange={(slot) => {
                        setSlots(loadSlots(window.localStorage));
                        if (isConfigured(slot)) applySlot(slot);
                    }}
                />
            </div>
        </RotarySettingsBoundary>
    );
}
