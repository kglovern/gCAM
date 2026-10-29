/**
 * Purpose: Implementation module for ConfirmDialog in the components domain.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import cx from 'classnames';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    rememberKey?: string;
}

/**
 * Reusable confirmation dialog (camcanvas confirmationModal parity).
 * Render once; call `confirm()` to await the user's choice.
 */
export function useConfirmation() {
    const [remember, setRemember] = useState(false);
    const [pending, setPending] = useState<
        (ConfirmOptions & { resolve: (v: boolean) => void }) | null
    >(null);

    useEffect(() => {
        if (!pending) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                pending.resolve(false);
                setPending(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pending]);

    const confirm = (opts: ConfirmOptions): Promise<boolean> => {
        try {
            if (
                opts.rememberKey &&
                localStorage.getItem(opts.rememberKey) === 'true'
            )
                return Promise.resolve(true);
        } catch {
            /* Confirmation remains available without storage. */
        }
        setRemember(false);
        return new Promise((resolve) => setPending({ ...opts, resolve }));
    };

    const dialog = pending ? (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
            onClick={() => {
                pending.resolve(false);
                setPending(null);
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
        >
            <div
                className="w-full max-w-sm rounded-lg border border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-dark p-4 space-y-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2
                    id="confirm-title"
                    className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"
                >
                    {pending.destructive && (
                        <AlertTriangle size={18} className="text-red-500" />
                    )}
                    {pending.title}
                </h2>
                <p
                    id="confirm-message"
                    className="text-sm text-slate-600 dark:text-slate-300"
                >
                    {pending.message}
                </p>
                {pending.rememberKey && (
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(event) =>
                                setRemember(event.target.checked)
                            }
                        />
                        Don’t show again
                    </label>
                )}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        onClick={() => {
                            pending.resolve(false);
                            setPending(null);
                        }}
                        className="rounded-lg border border-slate-300 dark:border-robin-900 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        Cancel
                    </button>
                    <button
                        autoFocus
                        onClick={() => {
                            if (remember && pending.rememberKey) {
                                try {
                                    localStorage.setItem(
                                        pending.rememberKey,
                                        'true',
                                    );
                                } catch {
                                    /* Keep this confirmation if storage is unavailable. */
                                }
                            }
                            pending.resolve(true);
                            setPending(null);
                        }}
                        className={cx(
                            'rounded-lg px-4 py-2 text-sm font-medium text-white touch-manipulation',
                            pending.destructive
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-robin-500 hover:bg-robin-600',
                        )}
                    >
                        {pending.confirmLabel ?? 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return { confirm, dialog };
}
