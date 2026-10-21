import type { ReactElement } from 'react';
import { UnitInput } from '../../../components/UnitInput';
import { lengthUnit, feedUnit, type UnitSystem } from '../../../lib/units';
import { panel, h2, hint, num, check, Row, Label } from './FieldLayout';
import { ToolSlotSelector } from '../../../toolpaths/ToolSlotSelector';
import { isConfigured, type ToolSlot } from '../../../tools/library';
import type { RotaryTool, RotaryToolType } from '../../engine/types';
function mapSlotType(t: ToolSlot['toolType']): RotaryToolType {
    if (t === 'ball' || t === 'ballnose') {
        return 'ball';
    }
    if (t === 'v-bit') {
        return 'vbit';
    }
    return 'flat';
}

export function ToolFields({
    tool,
    units,
    slots,
    onPatch,
    onSelectSlot,
    onOpenLibrary,
}: {
    tool: RotaryTool;
    units: UnitSystem;
    slots: ToolSlot[];
    onPatch: (patch: Partial<RotaryTool>) => void;
    onSelectSlot: (slotNum: number) => void;
    onOpenLibrary: () => void;
}): ReactElement {
    return (
        <section className={panel} aria-label="Tool">
            <h2 className={h2}>Tool</h2>
            <div className="mt-2">
                <ToolSlotSelector
                    slots={slots}
                    slotNum={tool.slotNum ?? 0}
                    units={units}
                    hasAnyConfiguredTool={slots.some(isConfigured)}
                    onSelect={onSelectSlot}
                    onOpenLibrary={onOpenLibrary}
                    onSetupTools={onOpenLibrary}
                />
            </div>
            <Row>
                <Label>
                    Type
                    <select
                        value={tool.type}
                        onChange={(e) =>
                            onPatch({ type: e.target.value as RotaryToolType })
                        }
                        className={`${num} w-auto max-w-full`}
                        aria-label="Rotary tool type"
                    >
                        <option value="flat">Flat endmill</option>
                        <option value="ball">Ball nose</option>
                        <option value="taper">Tapered ball ¼&Prime;</option>
                        <option value="vbit">V-bit 60°</option>
                    </select>
                </Label>
                <Label>
                    Ø
                    <UnitInput
                        units={units}
                        kind="length"
                        valueMm={tool.dia}
                        onChangeMm={(v) => onPatch({ dia: v })}
                        minMm={0.5}
                        maxMm={25}
                        stepMm={0.1}
                        className={num}
                        aria-label="Tool diameter"
                    />
                    {lengthUnit(units)}
                </Label>
            </Row>
            <Row>
                <Label>
                    Spindle
                    <input
                        type="number"
                        value={tool.spindle}
                        min={8000}
                        max={30000}
                        step={500}
                        onChange={(e) =>
                            onPatch({ spindle: Number(e.target.value) || 0 })
                        }
                        className={num}
                        aria-label="Spindle speed"
                    />
                    rpm
                </Label>
                <Label>
                    Feed
                    <UnitInput
                        units={units}
                        kind="feed"
                        valueMm={tool.feed}
                        onChangeMm={(v) => onPatch({ feed: v })}
                        minMm={50}
                        maxMm={4000}
                        className={num}
                        aria-label="Cutting feed"
                    />
                    {feedUnit(units)}
                </Label>
            </Row>
            <Row>
                <Label>
                    Plunge
                    <UnitInput
                        units={units}
                        kind="feed"
                        valueMm={tool.plunge}
                        onChangeMm={(v) => onPatch({ plunge: v })}
                        minMm={50}
                        maxMm={2000}
                        className={num}
                        aria-label="Plunge feed"
                    />
                    {feedUnit(units)}
                </Label>
            </Row>
        </section>
    );
}

export { mapSlotType };
