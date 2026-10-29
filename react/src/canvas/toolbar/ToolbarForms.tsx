/**
 * Purpose: Implementation module for ToolbarForms in the canvas domain.
 */
import { ToolbarMiniForm } from './ToolbarControls';
import { numericInput } from './styles';
import type { BooleanOperation } from '../../lib/engine';
import { lengthUnit } from '../../lib/units';
import { UnitInput } from '../../components/UnitInput';
import type { CanvasToolbarProps, ToolbarAction } from './types';

interface ToolbarFormsProps {
    props: CanvasToolbarProps;
    open: ToolbarAction;
    booleanOperation: BooleanOperation;
    onBooleanOperation: (operation: BooleanOperation) => void;
    close: () => void;
}

/** Inline parameter forms for modify operations. Kept separate from command menus. */
export function ToolbarForms({
    props,
    open,
    booleanOperation,
    onBooleanOperation,
    close,
}: ToolbarFormsProps) {
    const unit = lengthUnit(props.units);
    const lengthField = (
        label: string,
        value: number,
        onChange: (value: number) => void,
        className = numericInput,
    ) => (
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
            {label} ({unit})
            <UnitInput
                units={props.units}
                minMm={0.5}
                stepMm={0.5}
                valueMm={value}
                onChangeMm={onChange}
                aria-label={`${label} in ${unit}`}
                className={className}
            />
        </label>
    );

    if (open === 'fillet')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Radius',
                    props.cornerRadius,
                    props.onCornerRadius,
                )}
                onApply={() => {
                    props.onApplyFillet();
                    close();
                }}
                onCancel={close}
                title="Fillet Corners"
                applyLabel="Fillet"
            />
        );
    if (open === 'chamfer')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Distance',
                    props.cornerRadius,
                    props.onCornerRadius,
                    'w-56 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm',
                )}
                onApply={() => {
                    props.onApplyChamfer?.();
                    close();
                }}
                onCancel={close}
                title="Chamfer Corners"
                applyLabel="Chamfer"
            />
        );
    if (open === 'offset')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Amount',
                    props.offsetAmount,
                    props.onOffsetAmount,
                )}
                onApply={() => {
                    props.onApplyOffset();
                    close();
                }}
                onCancel={close}
                title="Offset Shapes"
                applyLabel="Offset"
            />
        );
    if (open === 'boolean')
        return (
            <ToolbarMiniForm
                fields={
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        Operation
                        <select
                            value={booleanOperation}
                            onChange={(event) =>
                                onBooleanOperation(
                                    event.target.value as BooleanOperation,
                                )
                            }
                            className={numericInput.replace(
                                'w-16',
                                'w-48 max-w-full',
                            )}
                        >
                            <option value="union">Combine</option>
                            <option value="difference">Subtract</option>
                            <option value="intersection">Keep overlap</option>
                            <option value="xor">Remove overlap</option>
                        </select>
                    </label>
                }
                onApply={() => {
                    props.onBoolean(booleanOperation);
                    close();
                }}
                onCancel={close}
                title="Combine / Subtract"
                applyLabel="Apply"
                canApply={props.canBoolean}
            />
        );
    if (open === 'nest')
        return (
            <ToolbarMiniForm
                fields={
                    <>
                        {lengthField('W', props.sheetW, props.onSheetW)}
                        {lengthField('H', props.sheetH, props.onSheetH)}
                    </>
                }
                onApply={() => {
                    props.onApplyNest();
                    close();
                }}
                onCancel={close}
                title="Nest Parts"
                applyLabel="Nest"
            />
        );
    return null;
}
