/**
 * Purpose: React hook that owns the AppKeyboardShortcuts workflow.
 */
import { useEffect } from 'react';

interface KeyboardShortcutOptions {
    hasSelection: boolean;
    canNudge: boolean;
    nudgeStep: number;
    nudgeSelected(dx: number, dy: number): void;
    setActiveTool(tool: 'select'): void;
    clearTransform(): void;
    clearGuidePlacement(): void;
    fitViewport(): void;
    undo(): void;
    redo(): void;
    deleteSelected(): void | Promise<void>;
    duplicateSelected(): void;
}

function isEditableTarget(target: EventTarget | null) {
    return (
        target instanceof Element &&
        !!target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"]',
        )
    );
}

/** Global canvas commands. Inputs retain their native editing shortcuts. */
export function useAppKeyboardShortcuts(options: KeyboardShortcutOptions) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;
            const key = event.key.toLowerCase();
            if (
                options.hasSelection &&
                options.canNudge &&
                !event.defaultPrevented &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                    event.key,
                )
            ) {
                event.preventDefault();
                const step = options.nudgeStep * (event.shiftKey ? 10 : 1);
                options.nudgeSelected(
                    event.key === 'ArrowLeft'
                        ? -step
                        : event.key === 'ArrowRight'
                          ? step
                          : 0,
                    event.key === 'ArrowDown'
                        ? -step
                        : event.key === 'ArrowUp'
                          ? step
                          : 0,
                );
                return;
            }
            if (event.key === 'Escape') {
                options.setActiveTool('select');
                options.clearTransform();
                options.clearGuidePlacement();
                return;
            }
            if (key === 'v') {
                options.setActiveTool('select');
                options.clearTransform();
                return;
            }
            if (key === 'f') {
                options.fitViewport();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && key === 'z') {
                event.preventDefault();
                if (event.shiftKey) options.redo();
                else options.undo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && key === 'y') {
                event.preventDefault();
                options.redo();
                return;
            }
            if (
                (event.key === 'Delete' || event.key === 'Backspace') &&
                options.hasSelection
            ) {
                event.preventDefault();
                void options.deleteSelected();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && key === 'd') {
                event.preventDefault();
                if (options.hasSelection) options.duplicateSelected();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [options]);
}
