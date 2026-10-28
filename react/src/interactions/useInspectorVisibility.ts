import { useEffect, useState } from 'react';

/** Selection highlights items; properties open only on request. */
export function useInspectorVisibility(selectionId: string | null) {
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
            openedId === selectionId,
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
