import { GripHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePanelPosition } from './usePanelPosition';

/** Shared movable chrome for non-modal canvas windows. */
export function FloatingPanel({
    title,
    label,
    closeLabel,
    onClose,
    className,
    children,
    placement = 'left',
}: {
    placement?: 'left' | 'right';
    title: string;
    label: string;
    closeLabel: string;
    onClose(): void;
    className: string;
    children: ReactNode;
}) {
    const { ref, style, handle, moved } = usePanelPosition();
    return (
        <aside
            ref={ref}
            style={style}
            aria-label={label}
            className={`absolute z-20 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white/95 shadow-xl dark:border-robin-900 dark:bg-dark/95 ${moved ? 'left-[var(--panel-left)] top-[var(--panel-top)] right-auto' : placement === 'right' ? 'top-2 right-2' : 'top-2 left-2'} ${className}`}
        >
            <div className="flex shrink-0 items-center border-b border-slate-200 bg-white dark:border-robin-900 dark:bg-dark">
                <button
                    type="button"
                    {...handle}
                    aria-label={`Move ${label.toLowerCase()}`}
                    title="Drag to move · Arrow keys to move · Home or double-click to reset"
                    className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 min-w-0 flex-1 cursor-move touch-none select-none items-center gap-2 px-3 text-left text-xs font-medium text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-robin-500"
                >
                    <GripHorizontal
                        size={14}
                        className="shrink-0 text-slate-400"
                    />
                    {title}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="inline-flex size-9 [@media(pointer:coarse)]:size-11 shrink-0 items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                    <X size={16} />
                </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
                {children}
            </div>
        </aside>
    );
}
