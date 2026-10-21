import { useSyncExternalStore } from 'react';

interface InstallPrompt extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export interface PwaState {
    installed: boolean;
    canInstall: boolean;
    offlineReady: boolean;
    updateAvailable: boolean;
    error: string;
}
let state: PwaState = {
    installed: false,
    canInstall: false,
    offlineReady: false,
    updateAvailable: false,
    error: '',
};
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let installPrompt: InstallPrompt | null = null;
let started = false;
const publish = (changes: Partial<PwaState>) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const usePwa = () =>
    useSyncExternalStore(
        subscribe,
        () => state,
        () => state,
    );

/** Register once, outside React lifecycles. Updates wait for an explicit restart. */
export function startPwa(production: boolean) {
    if (started) return;
    started = true;
    const standalone = window.matchMedia('(display-mode: standalone)');
    const fullscreen = window.matchMedia('(display-mode: fullscreen)');
    const installed = () =>
        publish({
            installed:
                standalone.matches ||
                fullscreen.matches ||
                Boolean(
                    (navigator as Navigator & { standalone?: boolean })
                        .standalone,
                ),
        });
    installed();
    standalone.addEventListener('change', installed);
    fullscreen.addEventListener('change', installed);
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPrompt = event as InstallPrompt;
        publish({ canInstall: true });
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        publish({ canInstall: false });
        installed();
    });
    if (
        !production ||
        !('serviceWorker' in navigator) ||
        !window.isSecureContext
    )
        return;
    navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
            scope: import.meta.env.BASE_URL,
            updateViaCache: 'none',
        })
        .then((value) => {
            registration = value;
            const waiting = () => {
                if (value.waiting) publish({ updateAvailable: true });
            };
            waiting();
            value.addEventListener('updatefound', () => {
                const worker = value.installing;
                worker?.addEventListener('statechange', () => {
                    if (worker.state === 'installed') {
                        if (navigator.serviceWorker.controller) waiting();
                        else publish({ offlineReady: true, error: '' });
                    }
                });
            });
            void navigator.serviceWorker.ready.then(() =>
                publish({ offlineReady: true, error: '' }),
            );
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible')
                    void value.update().catch(() => {});
            });
        })
        .catch(() =>
            publish({
                error: 'Offline setup could not finish. Reopen gCAM when connected to try again.',
            }),
        );
}

export async function installPwa() {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    publish({ canInstall: false, error: '' });
    try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') publish({ canInstall: false });
    } catch {
        publish({
            error: 'Use your browser’s install menu to add gCAM to your Home Screen.',
        });
    }
}

export function applyPwaUpdate() {
    if (!registration?.waiting) return;
    navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true },
    );
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}
