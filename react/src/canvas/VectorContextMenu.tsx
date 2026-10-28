import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import { findLoopAtPoint } from './selectionGeometry';
import { toWorldPoint } from './pointerState';
import type { Camera, ViewLoop } from './types';
import type { TransformMode } from '../lib/transform';
import type { CanvasStageProps } from './CanvasStage.types';

export interface VectorContextActions {
    duplicate(): void;
    delete(): void;
    transform(mode: TransformMode): void;
}

export function VectorContextMenu({
    children,
    canvasRef,
    cameraRef,
    loops,
    hidden,
    onSelect,
    onProperties,
    selected = [],
    actions,
    bitmaps = [],
    enabled = true,
    onMouseLeave,
}: {
    children: ReactNode;
    canvasRef: RefObject<HTMLCanvasElement>;
    cameraRef: RefObject<Camera>;
    loops: ViewLoop[];
    hidden: string[];
    onSelect: (ids: string[]) => void;
    onProperties?: () => void;
    selected?: string[];
    actions?: VectorContextActions;
    bitmaps?: CanvasStageProps['bitmaps'];
    enabled?: boolean;
    onMouseLeave?: () => void;
}) {
    const [position, setPosition] = useState<{ x: number; y: number } | null>(
        null,
    );
    const start = useRef<{ x: number; y: number } | null>(null);
    useEffect(() => {
        const close = () => setPosition(null);
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', key);
        };
    }, []);
    const items: { label: string; run: () => void; disabled?: boolean }[] = [
        ...(onProperties
            ? [
                  {
                      label: 'Properties',
                      run: onProperties,
                      disabled:
                          selected.length !== 1 ||
                          Boolean(
                              loops.find((loop) => loop.id === selected[0])
                                  ?.bitmapId,
                          ),
                  },
              ]
            : []),
        ...(actions
            ? [
                  {
                      label: 'Move',
                      run: () => actions.transform('move'),
                  },
                  {
                      label: 'Rotate',
                      run: () => actions.transform('rotate'),
                  },
                  {
                      label: 'Resize',
                      run: () => actions.transform('scale'),
                  },
                  {
                      label: 'Duplicate',
                      run: () => actions.duplicate(),
                  },
                  { label: 'Delete', run: () => actions.delete() },
              ]
            : []),
    ];
    return (
        <div
            className="relative flex-1 min-w-0"
            onMouseLeave={onMouseLeave}
            onPointerDownCapture={(event) => {
                start.current = { x: event.clientX, y: event.clientY };
            }}
            onContextMenuCapture={(event) => {
                event.preventDefault();
                setPosition(null);
                const canvas = canvasRef.current;
                const camera = cameraRef.current;
                if (
                    !canvas ||
                    !camera ||
                    !enabled ||
                    event.target !== canvas ||
                    (!onProperties && !actions)
                )
                    return;
                if (
                    start.current &&
                    Math.hypot(
                        event.clientX - start.current.x,
                        event.clientY - start.current.y,
                    ) >= 4
                )
                    return;
                const world = toWorldPoint(
                    { x: event.clientX, y: event.clientY },
                    canvas.getBoundingClientRect(),
                    camera,
                );
                const bitmap = [...bitmaps].reverse().find((entry) => {
                    const linked = loops.find(
                        (loop) => loop.bitmapId === entry.id,
                    );
                    if (!linked || hidden.includes(linked.id)) return false;
                    const angle = ((entry.rotation ?? 0) * Math.PI) / 180;
                    const dx = world.x - entry.x - entry.w / 2;
                    const dy = world.y - entry.y - entry.h / 2;
                    return (
                        Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) <=
                            entry.w / 2 &&
                        Math.abs(
                            -dx * Math.sin(angle) + dy * Math.cos(angle),
                        ) <=
                            entry.h / 2
                    );
                });
                const hit = bitmap
                    ? {
                          loopId: loops.find(
                              (loop) => loop.bitmapId === bitmap.id,
                          )!.id,
                      }
                    : findLoopAtPoint(loops, hidden, world, camera.scale);
                if (!hit) return;
                if (!selected.includes(hit.loopId)) onSelect([hit.loopId]);
                const rect = event.currentTarget.getBoundingClientRect();
                setPosition({
                    x: Math.max(
                        0,
                        Math.min(event.clientX - rect.left, rect.width - 140),
                    ),
                    y: Math.max(
                        0,
                        Math.min(
                            event.clientY - rect.top,
                            rect.height - (items.length * 36 + 8),
                        ),
                    ),
                });
            }}
        >
            {children}
            {position && (
                <div
                    role="menu"
                    aria-label="Item actions"
                    onKeyDown={(event) => {
                        const buttons = Array.from(
                            event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                'button:not(:disabled)',
                            ),
                        );
                        const index = buttons.indexOf(
                            document.activeElement as HTMLButtonElement,
                        );
                        if (
                            event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp'
                        ) {
                            event.preventDefault();
                            buttons[
                                (index +
                                    (event.key === 'ArrowDown' ? 1 : -1) +
                                    buttons.length) %
                                    buttons.length
                            ]?.focus();
                        }
                    }}
                    style={{ left: position.x, top: position.y }}
                    className="absolute z-50 w-36 rounded border border-slate-300 bg-white p-1 shadow-lg max-h-full overflow-y-auto dark:border-robin-900 dark:bg-dark-lighter"
                >
                    {items.map((item, index) => (
                        <button
                            key={item.label}
                            autoFocus={
                                index ===
                                items.findIndex((entry) => !entry.disabled)
                            }
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            className="w-full rounded px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 disabled:opacity-40 dark:text-white dark:hover:bg-robin-900"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                                setPosition(null);
                                item.run();
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
