import { ListChecks, SlidersHorizontal, X } from 'lucide-react';

/** Selection modifiers remain available without a hardware keyboard. */
export function CanvasSelectionActions({
    count,
    additive,
    onAdditiveChange,
    onClear,
    onProperties,
}: {
    count: number;
    additive: boolean;
    onAdditiveChange(value: boolean): void;
    onClear(): void;
    onProperties?: () => void;
}) {
    const button =
        'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-dark-lighter';
    return (
        <div
            className="mr-auto flex min-w-0 items-center gap-1"
            role="group"
            aria-label="Selection controls"
        >
            <span
                className="min-w-0 truncate text-xs tabular-nums text-slate-500 dark:text-slate-300"
                role="status"
            >
                {count ? `${count} selected` : 'Select shapes'}
            </span>
            <button
                type="button"
                aria-label="Multiple selection"
                title="Tap shapes to add or remove them from the selection"
                aria-pressed={additive}
                onClick={() => onAdditiveChange(!additive)}
                className={`${button} ${additive ? '!bg-robin-500 !text-white' : ''}`}
            >
                <ListChecks size={18} />
            </button>
            {count > 0 && (
                <button
                    type="button"
                    aria-label="Clear selection"
                    title="Clear selection"
                    onClick={onClear}
                    className={button}
                >
                    <X size={18} />
                </button>
            )}
            {onProperties && (
                <button
                    type="button"
                    aria-label="Properties"
                    title="Shape properties"
                    onClick={onProperties}
                    className={button}
                >
                    <SlidersHorizontal size={18} />
                    <span className="hidden sm:inline">Properties</span>
                </button>
            )}
        </div>
    );
}
