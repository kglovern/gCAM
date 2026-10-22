import { useEffect } from 'react';
import { RELEASES_URL } from './release';
import {
    checkUpdates,
    downloadUpdate,
    installUpdate,
    startUpdates,
    useUpdateState,
} from './store';

export function UpdateControls({ notice = false }: { notice?: boolean }) {
    const state = useUpdateState();
    useEffect(() => {
        void startUpdates();
        const ready = () => void startUpdates();
        document.addEventListener('deviceready', ready);
        return () => document.removeEventListener('deviceready', ready);
    }, []);
    if (
        !state ||
        (notice && !['available', 'downloading', 'ready'].includes(state.phase))
    )
        return null;
    const busy = state.phase === 'checking' || state.phase === 'downloading';
    const message =
        state.phase === 'available'
            ? `gCAM ${state.version} is available.`
            : state.phase === 'ready'
              ? 'Update downloaded. Save your project before restarting.'
              : state.phase === 'downloading'
                ? `Downloading update… ${state.percent ?? 0}%`
                : state.phase === 'checking'
                  ? 'Checking for updates…'
                  : state.phase === 'current'
                    ? 'You are up to date.'
                    : state.message || `gCAM ${state.currentVersion}`;
    const label =
        state.phase === 'ready'
            ? 'Restart to update'
            : state.platform === 'ios'
              ? state.destination?.includes('testflight.apple.com')
                  ? 'Open TestFlight'
                  : 'Open App Store'
              : state.platform === 'android'
                ? 'Download APK'
                : 'Download update';
    return (
        <section
            aria-label="Application updates"
            className={
                notice
                    ? 'shrink-0 border-b border-slate-200 bg-blue-50 px-3 py-2 dark:border-robin-900 dark:bg-dark'
                    : 'rounded-lg border border-slate-200 p-3 dark:border-robin-900'
            }
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-sm">
                    {message}
                </p>
                {['available', 'ready'].includes(state.phase) ? (
                    <button
                        type="button"
                        className="rounded bg-robin-600 px-3 py-2 text-sm text-white"
                        onClick={() =>
                            void (state.phase === 'ready'
                                ? installUpdate()
                                : downloadUpdate())
                        }
                    >
                        {label}
                    </button>
                ) : (
                    !notice &&
                    !(
                        state.platform === 'ios' &&
                        state.phase === 'idle' &&
                        state.message
                    ) && (
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-robin-900"
                            onClick={() => void checkUpdates()}
                        >
                            Check for updates
                        </button>
                    )
                )}
                {!notice && (
                    <a
                        className="text-sm underline"
                        href={RELEASES_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        GitHub Releases
                    </a>
                )}
            </div>
        </section>
    );
}
