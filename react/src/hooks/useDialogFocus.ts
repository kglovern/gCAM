import { useEffect, useRef, type RefObject } from 'react';

/** Focus the dialog without opening the software keyboard, trap Tab, then restore focus. */
export function useDialogFocus(
    ref: RefObject<HTMLElement | null>,
    open: boolean,
) {
    const previous = useRef<HTMLElement | null>(null);
    useEffect(() => {
        const panel = ref.current;
        if (!open || !panel) return;
        previous.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        const controls = () =>
            [
                ...panel.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                ),
            ].filter((element) => element.getClientRects().length > 0);
        (controls()[0] ?? panel).focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const items = controls();
            const first = items[0],
                last = items[items.length - 1];
            if (!first || !last) {
                event.preventDefault();
                return;
            }
            if (
                event.shiftKey &&
                (document.activeElement === first ||
                    !panel.contains(document.activeElement))
            ) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                    !panel.contains(document.activeElement))
            ) {
                event.preventDefault();
                first.focus();
            }
        };
        panel.addEventListener('keydown', trap);
        return () => {
            panel.removeEventListener('keydown', trap);
            if (previous.current?.isConnected) previous.current.focus();
        };
    }, [open, ref]);
}
