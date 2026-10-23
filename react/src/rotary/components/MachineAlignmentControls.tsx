import {
    alignmentFields,
    defaultAlignment,
    type MachineAlignment,
} from './machinePreview';

export function MachineAlignmentControls({
    value,
    onChange,
}: {
    value: MachineAlignment;
    onChange: (value: MachineAlignment) => void;
}) {
    return (
        <section className="px-3 py-2 text-xs">
            <div>
                <div className="grid grid-cols-3 gap-2">
                    {alignmentFields.map(([key, label, unit]) => (
                        <label
                            key={key}
                            className="flex min-w-0 flex-col gap-1"
                        >
                            {label} ({unit})
                            <input
                                type="number"
                                aria-label={`${label} (${unit})`}
                                min={-10000}
                                max={10000}
                                step={0.1}
                                value={value[key]}
                                className="min-h-9 w-full rounded border border-slate-300 bg-transparent px-2 dark:border-robin-700"
                                onChange={(event) => {
                                    const number = event.target.valueAsNumber;
                                    if (
                                        Number.isFinite(number) &&
                                        Math.abs(number) <= 10000
                                    )
                                        onChange({ ...value, [key]: number });
                                }}
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="min-h-9 rounded border px-2"
                        onClick={() => onChange({ ...defaultAlignment })}
                    >
                        Reset alignment
                    </button>
                    <button
                        type="button"
                        className="min-h-9 rounded border px-2"
                        onClick={() => {
                            const url = URL.createObjectURL(
                                new Blob([JSON.stringify(value, null, 2)], {
                                    type: 'application/json',
                                }),
                            );
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = 'rotary-machine-alignment.json';
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                    >
                        Download alignment
                    </button>
                </div>
            </div>
        </section>
    );
}
