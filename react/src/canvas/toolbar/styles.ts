/**
 * Purpose: Implementation module for styles in the canvas domain.
 */
export const toolbarButtonBase =
    'inline-flex items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white touch-manipulation disabled:opacity-30';

export const toolbarButton = `${toolbarButtonBase} justify-center w-10 h-10`;

export const toolbarLabeledButton = `${toolbarButton} w-10 gap-0 px-0 xl:w-auto xl:gap-1.5 xl:px-3`;

export const toolbarLabel = 'hidden xl:inline';

export const toolbarButtonActive =
    'bg-robin-500 text-white hover:bg-robin-500 dark:hover:bg-robin-500';

export const numericInput =
    'w-16 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm';
