/**
 * Purpose: Implementation module for ToolbarControls in the canvas domain.
 */
import { useState, type ReactNode } from 'react';
import cx from 'classnames';

const buttonClass =
    'inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white touch-manipulation disabled:opacity-30';

export function ToolbarSeparator() {
    return (
        <span
            aria-hidden="true"
            className="mx-1 h-6 w-px bg-slate-200 dark:bg-robin-900"
        />
    );
}

export function ToolbarMenuSeparator() {
    return (
        <div
            role="separator"
            className="my-1 border-t border-slate-200 dark:border-robin-900"
        />
    );
}

export function ToolbarMenu({
    label,
    icon,
    children,
    iconOnly,
    wide,
}: {
    label: string;
    icon?: ReactNode;
    children: ReactNode;
    iconOnly?: boolean;
    wide?: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative group" onMouseLeave={() => setOpen(false)}>
            <button
                type="button"
                aria-label={label}
                title={label}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={cx(
                    buttonClass,
                    'gap-1.5 px-2.5 text-sm',
                    wide && 'w-auto',
                    iconOnly ? 'w-10 px-0' : 'w-auto',
                )}
            >
                {icon}
                {!iconOnly && label}
            </button>
            <div
                onClick={(event) => {
                    if (
                        event.target instanceof Element &&
                        event.target.closest('[role="menuitem"]')
                    )
                        setOpen(false);
                }}
                className={cx(
                    'absolute left-0 top-8 z-50 min-w-48 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-robin-900 dark:bg-dark',
                    open ? 'block' : 'hidden',
                )}
            >
                {children}
            </div>
        </div>
    );
}

export function ToolbarMenuItem({
    label,
    icon,
    active,
    danger,
    disabled,
    onClick,
}: {
    label: string;
    icon?: ReactNode;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            role="menuitem"
            disabled={disabled}
            onClick={onClick}
            className={cx(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm capitalize touch-manipulation disabled:cursor-not-allowed disabled:opacity-40',
                active
                    ? 'bg-robin-500 text-white'
                    : danger
                      ? 'text-red-500 hover:bg-red-500/10'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter',
            )}
        >
            {icon && (
                <span
                    aria-hidden="true"
                    className={cx(
                        'flex h-4 w-4 shrink-0 items-center justify-center opacity-75',
                        active && 'opacity-100',
                    )}
                >
                    {icon}
                </span>
            )}
            {label}
        </button>
    );
}

export function ToolbarMiniForm({
    fields,
    onApply,
    onCancel,
    applyLabel,
    title = 'Tool settings',
    canApply = true,
}: {
    fields: ReactNode;
    onApply: () => void;
    onCancel: () => void;
    applyLabel: string;
    title?: string;
    canApply?: boolean;
}) {
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/80 p-4"
            onMouseDown={onCancel}
        >
            <form
                className="relative grid w-full max-w-lg gap-4 rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-dark dark:text-white"
                onMouseDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault();
                    onApply();
                }}
            >
                <div className="flex flex-col text-center sm:text-left">
                    <h2 className="mb-2 text-lg font-semibold leading-none tracking-tight text-blue-500 dark:text-white">
                        {title}
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="absolute right-4 top-4 rounded-sm px-1 text-lg leading-none text-slate-500 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:text-slate-300 dark:focus:ring-offset-dark-darker"
                    aria-label="Close"
                >
                    ×
                </button>
                <div className="flex flex-wrap items-center gap-4">
                    {fields}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-slate-300 bg-transparent px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:border-gray-600 dark:text-slate-200 dark:hover:bg-dark-lighter dark:focus:ring-offset-dark-darker"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canApply}
                        className="rounded-md bg-robin-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-robin-600 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:focus:ring-offset-dark-darker touch-manipulation"
                    >
                        {applyLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
