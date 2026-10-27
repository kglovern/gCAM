/**
 * Purpose: Implementation module for ToolSelectionFields in the react domain.
 */
import type { ToolSlot } from '../tools/library';
import { isConfigured } from '../tools/library';
import { ToolLibraryModal } from '../tools/ToolLibraryModal';
import type { UnitSystem } from '../lib/units';
import { ToolSlotSelector } from './ToolSlotSelector';

interface ToolSelectionFieldsProps {
    slots: ToolSlot[];
    hasAnyConfiguredTool: boolean;
    slotNum: number;
    units: UnitSystem;
    libraryOpen: boolean;
    librarySlot: number | null;
    onOpenLibrary(): void;
    onSetupTools(): void;
    onSelectSlot(slotNumber: number): void;
    onCloseLibrary(): void;
    onConfiguredSlot(slot: ToolSlot): void;
    slotIssue?: (slot: ToolSlot) => string | null;
}

/** Tool rack selection and its editor modal, independent of operation fields. */
export function ToolSelectionFields({
    slots,
    hasAnyConfiguredTool,
    slotNum,
    units,
    libraryOpen,
    librarySlot,
    onOpenLibrary,
    onSetupTools,
    onSelectSlot,
    onCloseLibrary,
    onConfiguredSlot,
    slotIssue,
}: ToolSelectionFieldsProps) {
    return (
        <>
            <ToolSlotSelector
                slots={slots}
                hasAnyConfiguredTool={hasAnyConfiguredTool}
                slotNum={slotNum}
                units={units}
                onOpenLibrary={onOpenLibrary}
                onSetupTools={onSetupTools}
                onSelect={onSelectSlot}
                slotIssue={slotIssue}
            />
            <ToolLibraryModal
                isOpen={libraryOpen}
                initialSlot={librarySlot}
                units={units}
                onClose={onCloseLibrary}
                onSlotChange={(slot) => {
                    if (slot.slot === slotNum && isConfigured(slot)) {
                        onConfiguredSlot(slot);
                    }
                }}
            />
        </>
    );
}
