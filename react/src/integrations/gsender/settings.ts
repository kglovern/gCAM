/**
 * Purpose: Persisted connection settings for the gSender handoff.
 */

/** Must match DEFAULT_GCAM_HANDOFF_PORT in gSender's GcamHandoff.js. */
export const DEFAULT_GSENDER_PORT = 47820;
export const GSENDER_PORT_STORAGE_KEY = 'gcam.gsender.port';

export function isValidGsenderPort(port: unknown): port is number {
    return (
        typeof port === 'number' &&
        Number.isInteger(port) &&
        port >= 1024 &&
        port <= 65535
    );
}

export function loadGsenderPort(): number {
    if (typeof window === 'undefined') return DEFAULT_GSENDER_PORT;
    try {
        const port = Number(
            window.localStorage.getItem(GSENDER_PORT_STORAGE_KEY),
        );
        return isValidGsenderPort(port) ? port : DEFAULT_GSENDER_PORT;
    } catch {
        return DEFAULT_GSENDER_PORT;
    }
}

export function saveGsenderPort(port: number): void {
    if (typeof window === 'undefined' || !isValidGsenderPort(port)) return;
    try {
        window.localStorage.setItem(GSENDER_PORT_STORAGE_KEY, String(port));
    } catch {
        // Storage can be unavailable (private mode); the default still works.
    }
}
