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

function checkHelp(message: string): string | null {
    if (/faces are occluded or unresolved/.test(message))
        return 'This pass machines accessible surfaces. Some areas may retain material; a smaller cutter or another setup may be needed.';
    if (
        /move limit|sample limit|million.sample|exceeded 90 seconds|resource limit/i.test(
            message,
        )
    )
        return 'This toolpath is too large to calculate with the current setup. Try a larger cutter, a smaller model or a simpler machining setup.';
    if (/residual|unresolved.*surface|unfinished/i.test(message))
        return 'The selected cutter and setup cannot finish every surface to the requested quality. Review the cutter size and model orientation.';
    return null;
}

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
                    .map((f, i) => {
                        const pending = f.msg.includes(
                            'Planning mesh toolpaths',
                        );
                        const help = checkHelp(f.msg);
                        return (
                            <li
                                key={i}
                                role={
                                    pending
                                        ? 'status'
                                        : f.level === 'e'
                                          ? 'alert'
                                          : undefined
                                }
                                className={`rounded-md border px-2 py-2 ${pending ? 'border-slate-200 bg-slate-50 text-slate-600 dark:bg-dark-lighter dark:text-slate-300' : levelClass[f.level]}`}
                            >
                                {pending
                                    ? f.msg.replace(
                                          'Planning mesh toolpaths',
                                          'Calculating toolpath',
                                      )
                                    : (help ?? f.msg)}
                                {help && (
                                    <>
                                        <a
                                            className="mt-2 block underline"
                                            href="#rotary-model-setup"
                                        >
                                            Review model setup
                                        </a>
                                        <details className="mt-2 text-xs">
                                            <summary className="cursor-pointer">
                                                Technical details
                                            </summary>
                                            <p className="mt-1 break-words">
                                                {f.msg}
                                            </p>
                                        </details>
                                    </>
                                )}
                            </li>
                        );
                    })}
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
