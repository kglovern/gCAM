import { useSyncExternalStore } from 'react';
import {
    androidRelease,
    appleUpdateUrl,
    newerVersion,
    RELEASE_API,
} from './release';

export interface UpdateState {
    phase:
        | 'idle'
        | 'checking'
        | 'current'
        | 'available'
        | 'downloading'
        | 'ready'
        | 'error';
    currentVersion?: string;
    version?: string;
    percent?: number;
    message?: string;
    platform?: string;
    destination?: string;
}
interface DesktopUpdates {
    status(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<UpdateState>;
    subscribe(callback: (state: UpdateState) => void): () => void;
}
interface MobileUpdates {
    open(
        url: string,
        success: () => void,
        failure: (error: string) => void,
    ): void;
}
declare global {
    interface Window {
        gcamUpdates?: DesktopUpdates;
        gcamMobileUpdates?: MobileUpdates;
    }
}
let state: UpdateState | null = null;
const listeners = new Set<() => void>();
let started = false;
let checking = false;
let destination: string | null = null;
let mobileInfo: { version: string; iosUpdateUrl?: string } | null = null;
const set = (next: UpdateState) => {
    state = next;
    listeners.forEach((listener) => listener());
};
const failure = () =>
    set({
        ...state,
        phase: 'error',
        message: 'Could not check for updates. Try again when online.',
    });

export async function checkUpdates() {
    if (window.gcamUpdates) {
        try {
            set(await window.gcamUpdates.check());
        } catch {
            failure();
        }
        return;
    }
    if (!mobileInfo || checking) return;
    checking = true;
    set({ ...state, phase: 'checking', message: '' });
    try {
        const response = await fetch(RELEASE_API, {
            signal: AbortSignal.timeout(15000),
        });
        if (response.status === 404) {
            set({ ...state, phase: 'current' });
            return;
        }
        if (!response.ok) throw new Error('Release check failed');
        const release = await response.json();
        const platform = state?.platform;
        const update =
            platform === 'android'
                ? androidRelease(release, mobileInfo.version)
                : !release.draft &&
                    !release.prerelease &&
                    typeof release.tag_name === 'string' &&
                    release.tag_name.startsWith('v') &&
                    newerVersion(release.tag_name.slice(1), mobileInfo.version)
                  ? {
                        version: release.tag_name.slice(1),
                        url: appleUpdateUrl(mobileInfo.iosUpdateUrl),
                    }
                  : null;
        destination = update?.url ?? null;
        set({
            ...state,
            phase: update && destination ? 'available' : 'current',
            version: update?.version,
            destination: destination ?? undefined,
        });
    } catch {
        failure();
    } finally {
        checking = false;
    }
}

export async function startUpdates() {
    if (started) return;
    if (!window.gcamUpdates && !window.gcamMobileUpdates) return;
    started = true;
    if (window.gcamUpdates) {
        window.gcamUpdates.subscribe(set);
        try {
            set(await window.gcamUpdates.status());
        } catch {
            failure();
        }
    } else if (window.gcamMobileUpdates) {
        try {
            const response = await fetch('./native-info.json');
            if (!response.ok) throw new Error('Missing native app version');
            mobileInfo = await response.json();
            const platform = (
                window as Window & { cordova?: { platformId?: string } }
            ).cordova?.platformId;
            if (!mobileInfo || !newerVersion('999.999.999', mobileInfo.version))
                throw new Error('Invalid app version');
            if (
                platform === 'ios' &&
                !appleUpdateUrl(mobileInfo.iosUpdateUrl)
            ) {
                set({
                    phase: 'idle',
                    currentVersion: mobileInfo.version,
                    platform,
                    message:
                        'iPad updates are delivered through TestFlight or the App Store. The distribution link is not configured yet.',
                });
                return;
            }
            set({
                phase: 'idle',
                currentVersion: mobileInfo.version,
                platform,
            });
            await checkUpdates();
        } catch {
            failure();
        }
    }
}

export async function downloadUpdate() {
    if (window.gcamUpdates) {
        try {
            set(await window.gcamUpdates.download());
        } catch {
            failure();
        }
    } else if (destination && window.gcamMobileUpdates) {
        window.gcamMobileUpdates.open(
            destination,
            () => {},
            () =>
                set({
                    ...state,
                    phase: 'error',
                    message: 'Could not open the update download.',
                }),
        );
    }
}
export async function installUpdate() {
    try {
        if (window.gcamUpdates) set(await window.gcamUpdates.install());
    } catch {
        failure();
    }
}
export function useUpdateState() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        () => state,
    );
}
