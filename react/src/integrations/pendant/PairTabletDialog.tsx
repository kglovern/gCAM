/**
 * Purpose: Pairs gCAM with a gSender pendant tablet, either by having the
 * tablet scan a one-time QR code or by typing the code the tablet shows.
 * Same flow as gSender's Send to Pendant pairing.
 */
import { Loader2, Tablet, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { type PendantTablet, pendantBridge } from './pendantBridge';

const POLL_MS = 1500;
const DEFAULT_RECEIVER_PORT = 8010;

const fieldCls =
    'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white';
const linkCls =
    'text-xs font-medium text-robin-700 hover:underline dark:text-robin-400';

export function PairTabletDialog({
    onClose,
    onPaired,
}: {
    onClose: () => void;
    onPaired: (tablet: PendantTablet) => void;
}) {
    const panelRef = useRef<HTMLElement>(null);
    const [view, setView] = useState<'qr' | 'code'>('qr');
    useDialogFocus(panelRef, true);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4"
            role="presentation"
        >
            <section
                ref={panelRef}
                aria-labelledby="pair-tablet-title"
                aria-modal="true"
                role="dialog"
                tabIndex={-1}
                className="w-full max-w-sm max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-robin-900 dark:bg-slate-900"
            >
                <div className="mb-4 flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-robin-100 text-robin-700 dark:bg-robin-950 dark:text-robin-300">
                        <Tablet size={20} />
                    </span>
                    <h2
                        id="pair-tablet-title"
                        className="flex-1 text-lg font-semibold text-slate-900 dark:text-white"
                    >
                        Pair a tablet
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <X size={18} />
                    </button>
                </div>
                {view === 'qr' ? (
                    <PairWithQr
                        onPaired={onPaired}
                        onUseCode={() => setView('code')}
                    />
                ) : (
                    <PairWithCode
                        onPaired={onPaired}
                        onUseQr={() => setView('qr')}
                    />
                )}
            </section>
        </div>
    );
}

// The tablet never connects back to us: the main process claims the scanned
// nonce against each discovered tablet's receiver until one accepts it.
function PairWithQr({
    onPaired,
    onUseCode,
}: {
    onPaired: (tablet: PendantTablet) => void;
    onUseCode: () => void;
}) {
    const [payload, setPayload] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const onPairedRef = useRef(onPaired);
    onPairedRef.current = onPaired;

    useEffect(() => {
        const bridge = pendantBridge();
        if (!bridge) return undefined;
        let cancelled = false;
        let timer: number | undefined;
        let nonce: string | null = null;

        const issue = async () => {
            try {
                const qr = await bridge.createQr();
                if (cancelled) return;
                nonce = qr.nonce;
                setPayload(qr.payload);
                setError(null);
            } catch {
                if (!cancelled) setError('Could not create a pairing code');
            }
        };

        const poll = async () => {
            if (cancelled) return;
            if (nonce) {
                try {
                    const result = await bridge.claim({ nonce });
                    if (cancelled) return;
                    if (result.paired) {
                        onPairedRef.current(result.tablet);
                        return;
                    }
                    // Expired - quietly swap in a fresh QR.
                    if (result.expired) await issue();
                } catch {
                    // Try again on the next tick.
                }
            }
            timer = window.setTimeout(poll, POLL_MS);
        };

        void issue().then(poll);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    return (
        <div className="flex flex-col items-center gap-3 text-sm">
            <p className="text-center text-slate-600 dark:text-slate-300">
                On the tablet, open <b>Remote File Receive</b> and tap{' '}
                <b>Pair with desktop</b>, then point it at this code.
            </p>
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-robin-900">
                {payload ? (
                    <QRCode size={200} value={payload} viewBox="0 0 200 200" />
                ) : (
                    <div className="flex h-[200px] w-[200px] items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                )}
            </div>
            {error ? (
                <p role="alert" className="text-xs text-red-600">
                    {error}
                </p>
            ) : (
                <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for a tablet to scan…
                </p>
            )}
            <button type="button" onClick={onUseCode} className={linkCls}>
                Use pairing code instead
            </button>
        </div>
    );
}

function PairWithCode({
    onPaired,
    onUseQr,
}: {
    onPaired: (tablet: PendantTablet) => void;
    onUseQr: () => void;
}) {
    const [host, setHost] = useState('');
    const [port, setPort] = useState(String(DEFAULT_RECEIVER_PORT));
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const valid = host.trim() !== '' && /^\d{6}$/.test(code.trim());

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const bridge = pendantBridge();
        if (!bridge || !valid || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await bridge.claim({
                host: host.trim(),
                port: Number(port) || DEFAULT_RECEIVER_PORT,
                code: code.trim(),
            });
            if (result.paired) {
                onPaired(result.tablet);
                return;
            }
            setError(result.message ?? 'Pairing failed');
        } catch {
            setError('Pairing failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
                Enter the address and 6-digit code shown in the tablet's{' '}
                <b>Remote File Receive</b> screen.
            </p>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Tablet address
                    <input
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="192.168.1.50"
                        inputMode="decimal"
                        className={fieldCls}
                    />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Port
                    <input
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className={fieldCls}
                    />
                </label>
            </div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Pairing code
                <input
                    value={code}
                    onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className={`${fieldCls} tracking-widest`}
                />
            </label>
            {error && (
                <p role="alert" className="text-xs text-red-600">
                    {error}
                </p>
            )}
            <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={onUseQr} className={linkCls}>
                    Scan a QR code instead
                </button>
                <button
                    type="submit"
                    disabled={!valid || busy}
                    className="flex items-center gap-2 rounded-lg bg-robin-500 px-4 py-2 text-sm font-semibold text-white hover:bg-robin-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    Pair
                </button>
            </div>
        </form>
    );
}
