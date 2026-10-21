import {
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
} from 'react';

type Position = { left: number; top: number };

/** Canvas-local movement, with pointer capture and bounds that follow resizing. */
export function usePanelPosition() {
    const ref = useRef<HTMLElement>(null);
    const [position, setPosition] = useState<Position | null>(null);
    const drag = useRef<{
        id: number;
        x: number;
        y: number;
        start: Position;
    } | null>(null);
    const clamp = (next: Position): Position => {
        const panel = ref.current;
        const parent = panel?.offsetParent;
        if (!(parent instanceof HTMLElement) || !panel) return next;
        return {
            left: Math.max(
                8,
                Math.min(next.left, parent.clientWidth - panel.offsetWidth - 8),
            ),
            top: Math.max(
                8,
                Math.min(
                    next.top,
                    parent.clientHeight - panel.offsetHeight - 8,
                ),
            ),
        };
    };
    const current = (): Position => ({
        left: ref.current?.offsetLeft ?? 8,
        top: ref.current?.offsetTop ?? 8,
    });
    useLayoutEffect(() => {
        const panel = ref.current;
        const parent = panel?.offsetParent;
        if (!panel || !(parent instanceof HTMLElement)) return;
        const observer = new ResizeObserver(() => {
            setPosition((previous) => {
                if (!previous) return null;
                const next = clamp(previous);
                return next.left === previous.left && next.top === previous.top
                    ? previous
                    : next;
            });
        });
        observer.observe(parent);
        observer.observe(panel);
        return () => observer.disconnect();
    }, []);
    return {
        ref,
        moved: Boolean(position),
        style: position
            ? ({
                  '--panel-left': `${position.left}px`,
                  '--panel-top': `${position.top}px`,
              } as CSSProperties)
            : undefined,
        handle: {
            onDoubleClick: () => setPosition(null),
            onPointerDown(event: PointerEvent<HTMLButtonElement>) {
                if (!event.isPrimary || event.button !== 0) return;
                drag.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    start: current(),
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.stopPropagation();
            },
            onPointerMove(event: PointerEvent<HTMLButtonElement>) {
                const active = drag.current;
                if (!active || active.id !== event.pointerId) return;
                setPosition(
                    clamp({
                        left: active.start.left + event.clientX - active.x,
                        top: active.start.top + event.clientY - active.y,
                    }),
                );
                event.stopPropagation();
            },
            onPointerUp() {
                drag.current = null;
            },
            onPointerCancel() {
                drag.current = null;
            },
            onLostPointerCapture() {
                drag.current = null;
            },
            onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
                if (event.key === 'Home') {
                    event.preventDefault();
                    event.stopPropagation();
                    setPosition(null);
                    return;
                }
                const delta = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                }[event.key];
                if (!delta) return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? 40 : 10;
                setPosition((previous) => {
                    const start = previous ?? current();
                    return clamp({
                        left: start.left + delta[0] * step,
                        top: start.top + delta[1] * step,
                    });
                });
            },
        },
    };
}
