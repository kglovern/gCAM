/**
 * Purpose: "Send to gSender" action that hands the current program to a
 * gSender instance running on this computer.
 */
import { Check, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import { gcodeFileName } from '../../toolpaths/exportGcode';
import { sendGcodeToGsender } from './gsenderClient';
import { loadGsenderPort } from './settings';

type SendState =
    | { phase: 'idle' }
    | { phase: 'sending' }
    | { phase: 'sent' }
    | { phase: 'error'; message: string };

export function SendToGsenderButton({
    gcode,
    fileName,
    className,
}: {
    gcode: string;
    fileName: string;
    className?: string;
}) {
    const [state, setState] = useState<SendState>({ phase: 'idle' });
    const resetTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(resetTimer.current), []);

    const send = async () => {
        if (!gcode.trim() || state.phase === 'sending') return;
        window.clearTimeout(resetTimer.current);
        setState({ phase: 'sending' });
        const result = await sendGcodeToGsender(
            loadGsenderPort(),
            gcodeFileName(fileName),
            gcode,
        );
        setState(
            result.ok
                ? { phase: 'sent' }
                : { phase: 'error', message: result.message },
        );
        resetTimer.current = window.setTimeout(
            () => setState({ phase: 'idle' }),
            result.ok ? 2500 : 8000,
        );
    };

    const Icon =
        state.phase === 'sending'
            ? Loader2
            : state.phase === 'sent'
              ? Check
              : Send;

    return (
        <div className="space-y-1">
            <button
                type="button"
                disabled={!gcode.trim() || state.phase === 'sending'}
                onClick={send}
                title="Load this program into gSender running on this computer"
                className={cx(
                    'flex w-full items-center justify-center gap-2 rounded-lg border border-robin-500 px-3 py-2 text-sm font-semibold text-robin-600 transition-colors hover:bg-robin-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-robin-300',
                    className,
                )}
            >
                <Icon
                    size={16}
                    className={cx(state.phase === 'sending' && 'animate-spin')}
                />
                {state.phase === 'sent' ? 'Sent to gSender' : 'Send to gSender'}
            </button>
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
