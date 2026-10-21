import type { ReactElement } from 'react';
export const panel =
    'rounded-lg border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark';
export const h2 = 'text-sm font-semibold text-slate-900 dark:text-white';
export const hint = 'mt-2 text-xs text-slate-500 dark:text-slate-400';
export const num =
    'min-h-11 max-w-full w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark-lighter dark:text-white';
export const check =
    'min-h-11 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200';

export function Row({ children }: { children: React.ReactNode }): ReactElement {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {children}
        </div>
    );
}

export function Label({
    children,
}: {
    children: React.ReactNode;
}): ReactElement {
    return (
        <label className="flex flex-wrap items-center gap-1 text-sm text-slate-700 dark:text-slate-200">
            {children}
        </label>
    );
}
