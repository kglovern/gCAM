import { profileMachiningSettings } from '../engine/profilePaths';
import { MeshSettingsFields } from './MeshSettingsFields';
import {
    defaultMeshSettings,
    meshSettingsForTool,
} from '../engine/meshToolpath';
import { StockFields } from './fields/StockFields';
import { formatLength } from '../../lib/units';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { RotaryPanel } from './RotaryPanel';
import { ToolpathOperationPicker } from '../../toolpaths/ToolpathOperationPicker';
import { ToolpathSubmitControls } from '../../toolpaths/ToolpathSubmitControls';
import { isConfigured, loadSlots } from '../../tools/library';
import { ROTARY_OPERATIONS, operationLabel } from '../engine/job';
import type { RotaryOperation } from '../engine/types';
import { RotaryCuttingFields } from './RotaryCuttingFields';
import { RotaryToolpathsPane } from './RotaryToolpathsPane';
import { ChecksList } from './ChecksGcode';

const images = Object.fromEntries(
    ROTARY_OPERATIONS.map((item) => [
        item.value,
        `${import.meta.env.BASE_URL}assets/operations/rotary-${item.value}.svg`,
    ]),
) as Record<RotaryOperation, string>;
const descriptions: Record<RotaryOperation, string> = {
    face: 'Face the end of the stock.',
    rough: 'Remove bulk material, leaving an allowance for finishing.',
    finish: 'Smooth the final shape after roughing the blank.',
    groove: 'Cut a groove at the specified position.',
    part: 'Separate the part from the remaining stock.',
};
export function RotaryToolpathSidebar({
    rotary: R,
    units,
    material,
    machineProfileId,
    onMaterialChange,
    onPreview,
}: ComponentProps<typeof RotaryPanel>) {
    const configured = loadSlots(window.localStorage).some(
        (slot) => slot.slot === R.tool.slotNum && isConfigured(slot),
    );
    const draftError =
        R.draftFlags.some((flag) => flag.level === 'e') ||
        (R.mode === 'stl' && !R.stlMesh);
    const openNew = () => {
        R.startToolpath();
    };
    return (
        <>
            <StockFields
                stock={R.stock}
                units={units}
                material={material}
                onPatch={(patch) =>
                    R.setStock((stock) => ({ ...stock, ...patch }))
                }
                onMaterialChange={onMaterialChange}
                onBeforeChange={R.pushHistory}
            />
            {!R.toolpathEditorOpen && (
                <section
                    aria-label="Rotary job toolpaths"
                    className="space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Job toolpaths ({R.toolpaths.length})
                        </h3>
                        {R.toolpaths.length > 0 && onPreview && (
                            <button
                                type="button"
                                aria-label="Preview toolpaths"
                                onClick={onPreview}
                                className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-robin-900"
                            >
                                Preview
                            </button>
                        )}
                        {!R.toolpathEditorOpen && (
                            <button
                                type="button"
                                onClick={openNew}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter"
                            >
                                <Plus size={12} />
                                Add Toolpath
                            </button>
                        )}
                    </div>
                    {!R.toolpaths.length && (
                        <p className="text-xs text-slate-500">
                            Choose an operation and add it to the job.
                        </p>
                    )}
                    {R.toolpaths.map((entry, index) => (
                        <div
                            key={entry.id}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-robin-900 dark:bg-dark-lighter"
                        >
                            <div className="flex items-center gap-2">
                                <img
                                    src={images[entry.operation]}
                                    alt=""
                                    className="h-8 w-10 object-contain dark:invert dark:hue-rotate-180"
                                />
                                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                                    {index + 1}.{' '}
                                    {operationLabel(entry.operation)}
                                    <span className="block text-[10px] text-slate-500">
                                        T{entry.tool.slotNum ?? 1} · Ø
                                        {formatLength(
                                            entry.tool.dia,
                                            units,
                                        )}{' '}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Move ${operationLabel(entry.operation)} up`}
                                    disabled={index === 0}
                                    onClick={() => R.moveToolpath(entry.id, -1)}
                                    className="text-slate-400 disabled:opacity-30"
                                >
                                    <ArrowUp size={14} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Move ${operationLabel(entry.operation)} down`}
                                    disabled={index === R.toolpaths.length - 1}
                                    onClick={() => R.moveToolpath(entry.id, 1)}
                                    className="text-slate-400 disabled:opacity-30"
                                >
                                    <ArrowDown size={14} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Edit ${operationLabel(entry.operation)}`}
                                    onClick={() => R.editToolpath(entry.id)}
                                    className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-robin-400"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Delete ${operationLabel(entry.operation)}`}
                                    onClick={() => R.removeToolpath(entry.id)}
                                    className="touch-target inline-flex items-center justify-center rounded text-slate-400 hover:text-red-500"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            )}
            {R.mode === 'stl' && !R.stlMesh && (
                <p className="rounded-lg border border-slate-200 p-3 text-sm dark:border-robin-900">
                    Import your STL on the left to start. Then choose an
                    operation and the cutter installed in your spindle.
                </p>
            )}
            {R.toolpathEditorOpen && (R.mode !== 'stl' || R.stlMesh) && (
                <>
                    <section className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Operation
                        </h3>
                        <ToolpathOperationPicker
                            operation={R.operation}
                            operations={
                                R.mode === 'stl'
                                    ? ROTARY_OPERATIONS.filter(
                                          (item) =>
                                              item.value === 'rough' ||
                                              item.value === 'finish',
                                      )
                                    : ROTARY_OPERATIONS
                            }
                            onChange={(operation) => {
                                R.setOperation(operation);
                                if (
                                    operation === 'rough' ||
                                    operation === 'finish'
                                )
                                    R.setOpsBase((ops) => ({
                                        ...ops,
                                        mesh: meshSettingsForTool(
                                            R.mode === 'profile'
                                                ? profileMachiningSettings(
                                                      ops,
                                                      R.tool,
                                                      operation === 'rough',
                                                  )
                                                : (ops.mesh ??
                                                      defaultMeshSettings),
                                            R.tool.dia,
                                            operation === 'rough',
                                        ),
                                    }));
                            }}
                            images={images}
                            descriptions={descriptions}
                        />
                    </section>
                    <RotaryCuttingFields
                        rotary={R}
                        units={units}
                        material={material}
                        machineProfileId={machineProfileId}
                    >
                        <MeshSettingsFields rotary={R} units={units} />
                        {configured && (
                            <RotaryToolpathsPane rotary={R} units={units} />
                        )}
                        <ToolpathSubmitControls
                            busy={R.planning}
                            progress={R.planningProgress}
                            hasActiveGeometry={
                                configured &&
                                !draftError &&
                                R.draftMoves.length > 0
                            }
                            editEntry={R.editingToolpathId !== null}
                            submitLabel="Add Toolpath"
                            selectedCount={0}
                            status={
                                !configured
                                    ? 'Choose a tool from the library.'
                                    : draftError && !R.planning
                                      ? 'Resolve the checks before adding this toolpath.'
                                      : ''
                            }
                            onGenerate={R.saveToolpath}
                            onCancelEdit={R.cancelToolpathEdit}
                        />
                        {!R.editingToolpathId && R.toolpaths.length > 0 && (
                            <button
                                type="button"
                                onClick={R.cancelToolpathEdit}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-robin-900 dark:text-slate-300"
                            >
                                Cancel
                            </button>
                        )}
                    </RotaryCuttingFields>
                </>
            )}
            <ChecksList flags={R.flags} />
        </>
    );
}
