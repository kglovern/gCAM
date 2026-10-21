import { useEffect, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Touch/small screens open properties explicitly; desktop retains auto-open. */
export function useInspectorVisibility(selectionId: string | null) {
    const explicit = useMediaQuery('(pointer: coarse), (max-width: 1023px)');
    const [openedId, setOpenedId] = useState<string | null>(null);
    const [dismissedId, setDismissedId] = useState<string | null>(null);
    useEffect(() => {
        setOpenedId(null);
        setDismissedId(null);
    }, [selectionId]);
    return {
        visible:
            selectionId !== null &&
            selectionId !== dismissedId &&
            (!explicit || openedId === selectionId),
        open: () => {
            setDismissedId(null);
            setOpenedId(selectionId);
        },
        close: () => {
            setDismissedId(selectionId);
            setOpenedId(null);
        },
    };
}
