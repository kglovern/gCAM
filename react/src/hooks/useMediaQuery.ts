import { useCallback, useSyncExternalStore } from 'react';

/** Subscribe to responsive input/layout changes, including device rotation. */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (notify: () => void) => {
            const media = window.matchMedia?.(query);
            media?.addEventListener('change', notify);
            return () => media?.removeEventListener('change', notify);
        },
        [query],
    );
    const snapshot = () => window.matchMedia?.(query).matches ?? false;
    return useSyncExternalStore(subscribe, snapshot, () => false);
}
