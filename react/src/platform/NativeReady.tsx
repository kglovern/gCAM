import { useEffect } from 'react';

/** The native startup screen clears after the editor commits its first render. */
export function NativeReady() {
    useEffect(() => {
        document.dispatchEvent(new Event('gcam-ready'));
    }, []);
    return null;
}
