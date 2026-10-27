/**
 * Purpose: "Send to Tablet" action that loads the current program on a paired
 * gSender pendant tablet. Desktop app only; hidden until a tablet is paired.
 */
import { Check, Loader2, Tablet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import { gcodeFileName } from '../../toolpaths/exportGcode';
import { type PendantTablet, pendantBridge } from './pendantBridge';
import { usePendantTablets } from './usePendantTablets';

const LAST_TABLET_STORAGE_KEY = 'gcam.pendant.lastTabletId';

type SendState =
    | { phase: 'idle' }
    | { phase: 'picking' }
    | { phase: 'sending' }
    | { phase: 'sent'; name: string }
    | { phase: 'error'; message: string };

function loadLastTablet(): string | null {
    try {
        return window.localStorage.getItem(LAST_TABLET_STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveLastTablet(id: string): void {
    try {
        window.localStorage.setItem(LAST_TABLET_STORAGE_KEY, id);
    } catch {
        // Storage can be unavailable; the picker still works.
    }
}

export function SendToTabletButton({
    gcode,
    fileName,
    className,
}: {
    gcode: string;
    fileName: string;
    className?: string;
}) {
    const { pairedTablets } = usePendantTablets();
    const [state, setState] = useState<SendState>({ phase: 'idle' });
    const resetTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(resetTimer.current), []);

    if (!pendantBridge() || !pairedTablets.length) return null;

    const send = async (tablet: PendantTablet) => {
        const bridge = pendantBridge();
        if (!bridge) return;
        window.clearTimeout(resetTimer.current);
        saveLastTablet(tablet.id);
        setState({ phase: 'sending' });
        const result = await bridge.send({
            tabletId: tablet.id,
            name: gcodeFileName(fileName),
            gcode,
        });
        setState(
            result.ok
                ? { phase: 'sent', name: tablet.name }
                : { phase: 'error', message: result.message },
        );
        resetTimer.current = window.setTimeout(
            () => setState({ phase: 'idle' }),
            result.ok ? 2500 : 8000,
        );
    };

    const onClick = () => {
        if (!gcode.trim() || state.phase === 'sending') return;
        if (pairedTablets.length === 1) {
            void send(pairedTablets[0]);
            return;
        }
        setState((current) =>
            current.phase === 'picking'
                ? { phase: 'idle' }
                : { phase: 'picking' },
        );
    };

    const lastId = loadLastTablet();
    const Icon =
        state.phase === 'sending'
            ? Loader2
            : state.phase === 'sent'
              ? Check
              : Tablet;
    const label =
        state.phase === 'sent'
            ? `Sent to ${state.name}`
            : pairedTablets.length === 1
              ? `Send to ${pairedTablets[0].name}`
              : 'Send to Tablet';

    return (
        <div className="relative space-y-1">
            <button
                type="button"
                disabled={!gcode.trim() || state.phase === 'sending'}
                onClick={onClick}
                aria-expanded={
                    pairedTablets.length > 1
                        ? state.phase === 'picking'
                        : undefined
                }
                title="Load this program on a paired gSender tablet"
                className={cx(
                    'flex w-full items-center justify-center gap-2 rounded-lg border border-robin-500 px-3 py-2 text-sm font-semibold text-robin-600 transition-colors hover:bg-robin-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-robin-300',
                    className,
                )}
            >
                <Icon
                    size={16}
                    className={cx(state.phase === 'sending' && 'animate-spin')}
                />
                <span className="truncate">{label}</span>
            </button>
            {state.phase === 'picking' && (
                <ul
                    aria-label="Paired tablets"
                    className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg dark:border-robin-900 dark:bg-slate-900"
                >
                    {pairedTablets.map((tablet) => (
                        <li key={tablet.id}>
                            <button
                                type="button"
                                onClick={() => void send(tablet)}
                                className={cx(
                                    'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-robin-50 dark:text-slate-100 dark:hover:bg-robin-950',
                                    tablet.id === lastId && 'font-semibold',
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'h-2 w-2 shrink-0 rounded-full',
                                        tablet.online
                                            ? 'bg-emerald-500'
                                            : 'bg-slate-400',
                                    )}
                                />
                                <span className="truncate">{tablet.name}</span>
                                {!tablet.online && (
                                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                                        offline
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {state.phase === 'error' && (
                <p
                    role="alert"
                    className="text-xs text-amber-700 dark:text-amber-400"
                >
                    {state.message}
                </p>
            )}
        </div>
    );
}
