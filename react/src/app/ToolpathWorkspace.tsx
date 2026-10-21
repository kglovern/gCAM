import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Keep a full canvas on narrow screens; reuse the same rail in a drawer. */
export function ToolpathWorkspace({
    children,
    rail,
    actions,
    selectedCount,
}: {
    children: ReactNode;
    rail: ReactNode;
    actions?: ReactNode;
    selectedCount: number;
}) {
    const compact = useMediaQuery('(max-width: 1099px)');
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const toggle = useRef<HTMLButtonElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!compact || !open) return;
        close.current?.focus();
        const escape = (event: KeyboardEvent) => {
            if (
                event
                    .composedPath()
                    .some(
                        (target) =>
                            target instanceof Element &&
                            target.getAttribute('role') === 'dialog',
                    )
            )
                return;
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        window.addEventListener('keydown', escape, true);
        return () => window.removeEventListener('keydown', escape, true);
    }, [compact, open]);
    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {(compact || actions) && (
                <div className="flex shrink-0 items-center justify-end gap-1 border-b border-slate-200 bg-white px-2 md:px-3 py-1 dark:border-robin-900 dark:bg-dark">
                    {actions}
                    {compact && (
                        <button
                            ref={toggle}
                            type="button"
                            aria-label="Toolpath settings"
                            aria-expanded={open}
                            aria-controls={panelId}
                            onClick={() => setOpen(!open)}
                            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700 dark:border-robin-900 dark:text-slate-200"
                        >
                            <SlidersHorizontal size={18} />
                            <span className="hidden min-[360px]:inline">
                                Toolpaths
                            </span>
                            {selectedCount > 0 && (
                                <span className="sr-only">
                                    {selectedCount} selected
                                </span>
                            )}
                        </button>
                    )}
                </div>
            )}
            <div className="relative flex min-h-0 flex-1">
                {children}
                <section
                    id={panelId}
                    aria-label="Toolpath settings panel"
                    hidden={compact && !open}
                    className={
                        compact
                            ? `absolute inset-y-0 right-0 z-30 w-full md:w-[360px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-robin-900 dark:bg-dark [&>aside]:w-full [&>aside]:min-h-0 [&>aside]:flex-1 ${open ? 'flex' : 'hidden'}`
                            : 'flex min-h-0 shrink-0 flex-col [&>aside]:flex-1'
                    }
                >
                    {compact && (
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pl-3 dark:border-robin-900">
                            <h2 className="text-sm font-semibold">Toolpaths</h2>
                            <button
                                ref={close}
                                type="button"
                                aria-label="Close toolpath settings"
                                className="inline-flex h-11 w-11 items-center justify-center"
                                onClick={() => {
                                    setOpen(false);
                                    toggle.current?.focus();
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}
                    {rail}
                </section>
            </div>
        </div>
    );
}
