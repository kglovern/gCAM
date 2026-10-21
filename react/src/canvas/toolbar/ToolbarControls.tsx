/**
 * Purpose: Implementation module for ToolbarControls in the canvas domain.
 */
import {
    useEffect,
    useLayoutEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import cx from 'classnames';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useInlineToolbar } from './ToolbarOverflow';

import { toolbarButtonBase } from './styles';

export function ToolbarSeparator() {
    return (
        <span
            aria-hidden="true"
            className="mx-0 xl:mx-1 h-6 w-px bg-slate-200 dark:bg-robin-900"
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
    const inline = useInlineToolbar();
    const [position, setPosition] = useState({
        left: 8,
        top: 64,
        maxHeight: 400,
    });
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        if (!open || inline) return;
        const place = () => {
            const rect = toggle.current?.getBoundingClientRect();
            if (!rect) return;
            setPosition({
                left: Math.max(
                    8,
                    Math.min(
                        rect.left,
                        window.innerWidth -
                            Math.min(256, window.innerWidth - 16) -
                            8,
                    ),
                ),
                top: rect.bottom + 4,
                maxHeight: Math.max(100, window.innerHeight - rect.bottom - 12),
            });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open, inline]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !root.current?.contains(event.target)
            )
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        window.addEventListener('pointerdown', outside);
        window.addEventListener('keydown', escape);
        return () => {
            window.removeEventListener('pointerdown', outside);
            window.removeEventListener('keydown', escape);
        };
    }, [open]);
    return (
        <div
            ref={root}
            className="relative"
            onClick={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest('[role="menuitem"]')
                ) {
                    setOpen(false);
                    toggle.current?.focus();
                }
            }}
        >
            <button
                type="button"
                ref={toggle}
                aria-label={label}
                title={label}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={cx(
                    toolbarButtonBase,
                    inline
                        ? 'h-11 w-full justify-start gap-2 px-3 text-sm'
                        : [
                              'h-10 justify-center gap-0 px-0 text-sm xl:gap-1.5 xl:px-2.5',
                              wide && 'xl:w-auto',
                              iconOnly ? 'w-10 xl:px-0' : 'w-10 xl:w-auto',
                          ],
                )}
            >
                {icon}
                {inline ? (
                    <span>{label}</span>
                ) : (
                    !iconOnly && (
                        <span className="hidden xl:inline">{label}</span>
                    )
                )}
            </button>
            <div
                role="menu"
                style={inline ? undefined : position}
                aria-label={label}
                className={cx(
                    'z-50 rounded-md border border-slate-200 bg-white p-1 dark:border-robin-900 dark:bg-dark',
                    inline
                        ? 'ml-2 border-l-2'
                        : 'fixed w-64 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain shadow-xl',
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
    const dialogRef = useRef<HTMLFormElement>(null);
    const titleId = useId();
    useDialogFocus(dialogRef, true);
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/80 p-4"
            onMouseDown={onCancel}
        >
            <form
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative grid w-full max-w-lg max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain gap-4 rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-dark dark:text-white"
                onMouseDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault();
                    onApply();
                }}
            >
                <div className="flex flex-col text-center sm:text-left">
                    <h2
                        id={titleId}
                        className="mb-2 text-lg font-semibold leading-none tracking-tight text-slate-900 dark:text-white0 dark:text-white"
                    >
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
