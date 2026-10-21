import { useRef, type ReactNode } from 'react';
/** One undo entry per numeric edit; switches and selects remain separate actions. */
export function RotarySettingsBoundary({
    children,
    onBeforeChange,
}: {
    children: ReactNode;
    onBeforeChange(): void;
}) {
    const changed = useRef(false);
    return (
        <div
            onFocusCapture={() => {
                changed.current = false;
            }}
            onChangeCapture={(event) => {
                const target = event.target;
                if (
                    !(
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLSelectElement
                    ) ||
                    (target instanceof HTMLInputElement &&
                        target.type === 'file')
                )
                    return;
                if (
                    !changed.current ||
                    target instanceof HTMLSelectElement ||
                    target.type === 'checkbox'
                )
                    onBeforeChange();
                changed.current = true;
            }}
        >
            {children}
        </div>
    );
}
