import { CircleHelp, Hand, X } from 'lucide-react';
import { useState } from 'react';

/** Optional one-finger navigation and on-demand help leave the drawing unobscured. */
export function CanvasNavigationControls({
    pan,
    onPanChange,
}: {
    pan: boolean;
    onPanChange(value: boolean): void;
}) {
    const [help, setHelp] = useState(false);
    const button =
        'inline-flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white/95 text-slate-600 shadow-sm dark:border-robin-900 dark:bg-dark/95 dark:text-slate-200';
    return (
        <div className="absolute bottom-2 left-2 z-10 flex gap-1">
            <button
                type="button"
                aria-label="Pan view"
                title="Pan view with one finger; tap again to select"
                aria-pressed={pan}
                onClick={() => onPanChange(!pan)}
                className={`${button} ${pan ? '!border-robin-500 !bg-robin-500 !text-white' : ''}`}
            >
                <Hand size={18} />
            </button>
            <button
                type="button"
                aria-label="Canvas gesture help"
                title="Canvas gesture help"
                aria-expanded={help}
                onClick={() => setHelp(!help)}
                className={button}
            >
                <CircleHelp size={18} />
            </button>
            {help && (
                <div
                    role="note"
                    className="absolute bottom-full left-0 mb-2 w-64 max-w-[calc(100vw-40px)] rounded-lg border border-slate-300 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg dark:border-robin-900 dark:bg-dark dark:text-slate-200"
                >
                    <div className="mb-1 flex items-center justify-between font-semibold">
                        Canvas gestures
                        <button
                            type="button"
                            aria-label="Close gesture help"
                            onClick={() => setHelp(false)}
                            className="inline-flex h-11 w-11 items-center justify-center"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <p>
                        Tap a vector to select. Turn on Multiple selection to
                        add or remove vectors.
                    </p>
                    <p className="mt-2">
                        Drag right to select enclosed vectors; drag left to
                        select crossing vectors.
                    </p>
                    <p className="mt-2">
                        Use two fingers to pan and pinch to zoom. Pan view lets
                        you move with one finger.
                    </p>
                </div>
            )}
        </div>
    );
}
