/**
 * Purpose: Typed access to the desktop app's tablet pairing bridge
 * (packaging/desktop/preload.cjs). Absent in the web and Cordova builds, which
 * can't reach tablets, so every pendant UI checks isPendantAvailable() first.
 */

export type PendantTablet = {
    id: string;
    name: string;
    host?: string;
    port?: number;
    paired: boolean;
    online: boolean;
};

export type PendantState = {
    browsing: boolean;
    tablets: PendantTablet[];
};

export type PendantClaimResult =
    | { paired: true; tablet: PendantTablet }
    | { paired: false; expired?: boolean; message?: string };

export type PendantSendResult =
    | { ok: true }
    | {
          ok: false;
          reason: 'unpaired' | 'unreachable' | 'too-large' | 'error';
          message: string;
      };

export interface PendantBridge {
    discover(): Promise<PendantState>;
    createQr(): Promise<{ nonce: string; expiresAt: number; payload: string }>;
    claim(
        request:
            | { nonce: string }
            | { host: string; port: number; code: string },
    ): Promise<PendantClaimResult>;
    forget(id: string): Promise<boolean>;
    send(request: {
        tabletId: string;
        name: string;
        gcode: string;
    }): Promise<PendantSendResult>;
    onChanged(callback: (state: PendantState) => void): () => void;
}

type PendantWindow = Window & { gcamPendant?: PendantBridge };

export function pendantBridge(): PendantBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as PendantWindow).gcamPendant ?? null;
}

export function isPendantAvailable(): boolean {
    return pendantBridge() !== null;
}
