/**
 * Purpose: Implementation module for CanvasToolbar in the react domain.
 */
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ToolbarOverflow } from './toolbar/ToolbarOverflow';
import { applyBoolean, offsetLoops } from '../lib/engine';
import { ToolbarCommands } from './toolbar/ToolbarCommands';
import { ToolbarForms } from './toolbar/ToolbarForms';
import { ToolbarMenus } from './toolbar/ToolbarMenus';
import type { CanvasToolbarProps, ToolbarAction } from './toolbar/types';

export type { CanvasToolbarProps, ToolbarAction } from './toolbar/types';

/** Composition root for independently maintained canvas toolbar groups. */
export function CanvasToolbar(props: CanvasToolbarProps) {
    const phone = useMediaQuery('(max-width: 767px)');
    const [open, setOpen] = useState<ToolbarAction>(null);
    const [booleanOperation, setBooleanOperation] =
        useState<Parameters<CanvasToolbarProps['onBoolean']>[0]>('union');
    const rootRef = useRef<HTMLDivElement>(null);
    const close = () => setOpen(null);
    const toggle = (action: Exclude<ToolbarAction, null>) =>
        setOpen((current) => (current === action ? null : action));

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (
                rootRef.current &&
                !rootRef.current.contains(event.target as Node)
            )
                close();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                props.onTransformMode(null);
                close();
            }
        };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [props.onTransformMode]);

    useEffect(() => {
        if (
            open !== 'offset' ||
            !props.offsetSource.length ||
            !props.offsetAmount
        ) {
            props.onOffsetPreview([]);
            return;
        }
        const timer = window.setTimeout(() => {
            try {
                props.onOffsetPreview(
                    offsetLoops(props.offsetSource, props.offsetAmount).map(
                        (result) => result.points,
                    ),
                );
            } catch {
                props.onOffsetPreview([]);
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [open, props.offsetAmount, props.offsetSource, props.onOffsetPreview]);

    useEffect(() => {
        if (open !== 'boolean' || !props.canBoolean) {
            props.onBooleanPreview([]);
            return;
        }
        try {
            props.onBooleanPreview(
                applyBoolean(props.booleanSource, booleanOperation).map(
                    (loop) => loop.points,
                ),
            );
        } catch {
            props.onBooleanPreview([]);
        }
    }, [
        booleanOperation,
        open,
        props.booleanSource,
        props.canBoolean,
        props.onBooleanPreview,
    ]);

    return (
        <div ref={rootRef} className="shrink-0 flex flex-col">
            <div
                className="relative flex flex-wrap items-center gap-0.5 overflow-visible"
                role="toolbar"
                aria-label="Canvas tools"
            >
                <ToolbarMenus
                    props={props}
                    activeAction={open}
                    openAction={toggle}
                    close={close}
                    group={phone ? 'file' : 'all'}
                />
                <ToolbarCommands
                    props={props}
                    open={open}
                    close={close}
                    group={phone ? 'primary' : 'all'}
                />
                {phone && (
                    <ToolbarOverflow>
                        <ToolbarMenus
                            props={props}
                            activeAction={open}
                            openAction={toggle}
                            close={close}
                            group="secondary"
                        />
                        <ToolbarCommands
                            props={props}
                            open={open}
                            close={close}
                            group="secondary"
                        />
                    </ToolbarOverflow>
                )}
            </div>
            <ToolbarForms
                props={props}
                open={open}
                booleanOperation={booleanOperation}
                onBooleanOperation={setBooleanOperation}
                close={close}
            />
        </div>
    );
}
