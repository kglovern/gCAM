/**
 * Purpose: Rotary blocking checks and warnings.
 */
import type { ReactElement } from 'react';
import type { RotaryCheck } from '../engine/types';

const levelClass: Record<RotaryCheck['level'], string> = {
    e: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900',
    w: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900',
    o: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900',
};

export function ChecksList({
    flags,
    onGenerate,
}: {
    flags: RotaryCheck[];
    onGenerate?: () => void;
}): ReactElement {
    return (
        <section className="space-y-1" aria-label="Checks">
            <ul className="mt-2 space-y-1 text-[13px]">
                {flags
                    .filter((f) => f.level !== 'o')
                    .map((f, i) => (
                        <li
                            key={i}
                            className={`rounded-md border px-2 py-1 ${levelClass[f.level]}`}
                        >
                            {f.msg}
                        </li>
                    ))}
            </ul>
            {onGenerate && (
                <button
                    type="button"
                    onClick={onGenerate}
                    className="mt-2 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-orange-600"
                >
                    Generate G-code
                </button>
            )}
        </section>
    );
}
