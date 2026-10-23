/**
 * Purpose: Implementation module for ToolpathOperationPicker in the react domain.
 */
import type { Operation } from '../lib/engine';
import { OPERATION_IMAGES } from './operationCatalog';

interface ToolpathOperationPickerProps<T extends string> {
    operation: T;
    operations: { value: T; label: string }[];
    onChange: (operation: T) => void;
    images?: Partial<Record<T, string>>;
    descriptions?: Partial<Record<T, string>>;
}

/** Operation selector kept independent from the parameter form. */
export function ToolpathOperationPicker<T extends string = Operation>({
    operation,
    operations,
    onChange,
    images,
    descriptions: suppliedDescriptions,
}: ToolpathOperationPickerProps<T>) {
    const descriptions: Record<string, string | undefined> =
        suppliedDescriptions ?? {
            'profile-outside':
                'Cut around the outside edge to shape or release a part.',
            'profile-inside':
                'Cut along the inside edge to make a hole or opening.',
            pocket: 'Clear material from inside a closed shape to make a flat-bottomed recess.',
            engrave:
                'Follow the selected line with the cutter to mark or trace it.',
            vcarve: 'Carve the space between selected lines with a V-bit.',
            countersink:
                'Widen the top of a drilled hole for a countersunk screw.',
            'surface-clear':
                'Remove the bulk of material from an imported 3D model.',
            'surface-finish':
                'Make a smoother final pass over an imported 3D model.',
            'surface-waterline':
                'Finish steep areas of a 3D model with level contour passes.',
        };
    const operationImages: Record<string, string | undefined> =
        images ?? OPERATION_IMAGES;
    const description = descriptions[operation];

    return (
        <>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-300 bg-slate-50/70 p-1 dark:border-robin-900 dark:bg-slate-900/70">
                {operations.map((item) => (
                    <button
                        key={item.value}
                        onClick={() => onChange(item.value)}
                        aria-pressed={operation === item.value}
                        title={descriptions[item.value] ?? item.label}
                        aria-label={`${item.label}${descriptions[item.value] ? `: ${descriptions[item.value]}` : ''}`}
                        className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-0.5 text-center text-[10px] font-medium leading-tight transition-colors touch-manipulation ${
                            operation === item.value
                                ? 'border-robin-600 bg-robin-100 text-robin-950 ring-1 ring-robin-500/60 dark:border-robin-500 dark:bg-robin-900/70 dark:text-white'
                                : 'border-transparent text-slate-600 hover:border-robin-900/60 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                        }`}
                    >
                        <span className="grid h-8 w-10 shrink-0 place-items-center overflow-hidden rounded border border-slate-300 bg-white dark:border-robin-900 dark:bg-dark">
                            {operationImages[item.value] ? (
                                <img
                                    src={operationImages[item.value]}
                                    alt=""
                                    className="h-full w-full object-contain dark:invert dark:hue-rotate-180"
                                />
                            ) : (
                                <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
                                    {item.label}
                                </span>
                            )}
                        </span>
                        <span className="flex min-h-5 items-center justify-center">
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
            {description && (
                <p
                    className="text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                    aria-live="polite"
                >
                    {description}
                </p>
            )}
        </>
    );
}
