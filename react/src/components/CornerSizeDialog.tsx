import { useState } from 'react';
import { UnitInput } from './UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';

/** Shown after a corner has been picked on the drawing. */
export function CornerSizeDialog({
    tool,
    initialSize,
    units,
    onApply,
    onCancel,
}: {
    tool: 'fillet' | 'chamfer';
    initialSize: number;
    units: UnitSystem;
    onApply(size: number): boolean;
    onCancel(): void;
}) {
    const [size, setSize] = useState(initialSize);
    const [error, setError] = useState(false);
    const label = tool === 'fillet' ? 'Radius' : 'Distance';
    return (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
            <form
                role="dialog"
                aria-modal="true"
                aria-label={
                    tool === 'fillet' ? 'Fillet corner' : 'Chamfer corner'
                }
                className="w-full max-w-xs space-y-4 rounded-lg border border-slate-300 bg-white p-4 text-slate-900 shadow-xl dark:border-robin-900 dark:bg-dark dark:text-white"
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        onCancel();
                    }
                }}
                onSubmit={(event) => {
                    event.preventDefault();
                    setError(!onApply(size));
                }}
            >
                <h2 className="font-semibold">
                    {tool === 'fillet' ? 'Fillet corner' : 'Chamfer corner'}
                </h2>
                <label className="block text-sm">
                    {label} ({lengthUnit(units)})
                    <UnitInput
                        autoFocus
                        required
                        aria-label={`${label} (${lengthUnit(units)})`}
                        units={units}
                        valueMm={size}
                        onChangeMm={(value) => {
                            setSize(value);
                            setError(false);
                        }}
                        minMm={0}
                        stepMm="any"
                        className="mt-1 w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-robin-900"
                    />
                </label>
                {error && (
                    <p role="alert" className="text-sm text-red-500">
                        That corner cannot fit this size.
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border px-3 py-2 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!Number.isFinite(size) || size <= 0}
                        className="rounded bg-robin-500 px-3 py-2 text-sm text-white disabled:opacity-40"
                    >
                        Apply
                    </button>
                </div>
            </form>
        </div>
    );
}
