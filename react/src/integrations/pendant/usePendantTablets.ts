/**
 * Purpose: Live list of paired and discovered tablets from the desktop bridge.
 */
import { useCallback, useEffect, useState } from 'react';
import { type PendantState, pendantBridge } from './pendantBridge';

// The main process stops browsing after 2 minutes without a request, so ping
// it more often than that while anything is watching.
const KEEPALIVE_MS = 60 * 1000;

const EMPTY: PendantState = { browsing: false, tablets: [] };

export function usePendantTablets() {
    const [state, setState] = useState<PendantState>(EMPTY);

    const refresh = useCallback(async () => {
        const bridge = pendantBridge();
        if (!bridge) return;
        try {
            setState(await bridge.discover());
        } catch {
            // Keep the last known list; pairing by code still works.
        }
    }, []);

    useEffect(() => {
        const bridge = pendantBridge();
        if (!bridge) return undefined;
        void refresh();
        const timer = window.setInterval(refresh, KEEPALIVE_MS);
        const unsubscribe = bridge.onChanged(setState);
        return () => {
            window.clearInterval(timer);
            unsubscribe();
        };
    }, [refresh]);

    const forget = useCallback(
        async (id: string) => {
            await pendantBridge()?.forget(id);
            await refresh();
        },
        [refresh],
    );

    return {
        ...state,
        pairedTablets: state.tablets.filter((tablet) => tablet.paired),
        refresh,
        forget,
    };
}
