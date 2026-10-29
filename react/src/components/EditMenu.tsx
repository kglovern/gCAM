/**
 * Purpose: Implementation module for EditMenu in the components domain.
 */
import { useEffect, useRef, useState } from 'react';
import { Link2, PencilRuler, Unlink2 } from 'lucide-react';
import cx from 'classnames';
import type { BooleanOperation } from '../lib/engine';
import { displayValue, lengthUnit, toMm, type UnitSystem } from '../lib/units';

interface EditMenuProps {
    units: UnitSystem;
    moveX: number;
    moveY: number;
    onMoveX: (v: number) => void;
    onMoveY: (v: number) => void;
    onApplyMove: () => void;
    rotateDeg: number;
    onRotateDeg: (v: number) => void;
    onApplyRotate: () => void;
    sizeW: number;
    sizeH: number;
    onSizeW: (v: number) => void;
    onSizeH: (v: number) => void;
    aspectLock: boolean;
    onAspectLock: (v: boolean) => void;
    onApplyScale: () => void;
    cornerRadius: number;
    onCornerRadius: (v: number) => void;
    onApplyFillet: () => void;
    onApplyChamfer?: () => void;
    onApplyDogbone: () => void;
    offsetAmount: number;
    onOffsetAmount: (v: number) => void;
    onApplyOffset: () => void;
    onBoolean: (op: BooleanOperation) => void;
    canBoolean: boolean;
    sheetW: number;
    sheetH: number;
    onSheetW: (v: number) => void;
    onSheetH: (v: number) => void;
    onApplyNest: () => void;
    hasSelection: boolean;
    hasGeometry: boolean;
    showTrace: boolean;
    tracing: boolean;
    onTrace: () => void;
}

const numCls =
    'w-16 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm';
const applyCls =
    'rounded-lg border border-slate-300 dark:border-robin-900 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation';

/**
 * Edit dropdown in the top bar — the camcanvas Modify-menu equivalent.
 * Hosts the parametric vector actions (relocated from the old bottom bar).
 */
export function EditMenu(props: EditMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node))
                setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const close = () => setOpen(false);
    const displayLength = (value: number) => displayValue(value, props.units);
    const parseLength = (value: string) => toMm(Number(value), props.units);

    return (
        <div ref={rootRef} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={open}
                className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm touch-manipulation',
                    open
                        ? 'bg-robin-500 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white',
                )}
            >
                <PencilRuler size={16} />
                Edit
            </button>
            {open && (
                <div
                    role="menu"
                    aria-label="Edit shapes"
                    className="absolute left-0 top-11 z-40 w-72 rounded-xl border border-slate-200 dark:border-robin-900 bg-white dark:bg-dark p-3 space-y-3 shadow-xl max-h-[70vh] overflow-y-auto"
                >
                    <Section title="Transform">
                        <Row
                            label={`Position X/Y (${lengthUnit(props.units)})`}
                        >
                            <input
                                type="number"
                                step={0.01}
                                value={displayLength(props.moveX)}
                                onChange={(e) =>
                                    props.onMoveX(parseLength(e.target.value))
                                }
                                aria-label={`Position X in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <input
                                type="number"
                                step={0.01}
                                value={displayLength(props.moveY)}
                                onChange={(e) =>
                                    props.onMoveY(parseLength(e.target.value))
                                }
                                aria-label={`Position Y in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <button
                                onClick={() => {
                                    props.onApplyMove();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Apply Position
                            </button>
                        </Row>
                        <Row label="Angle (°)">
                            <input
                                type="number"
                                step={0.1}
                                value={props.rotateDeg}
                                onChange={(e) =>
                                    props.onRotateDeg(Number(e.target.value))
                                }
                                aria-label="Angle in degrees"
                                className={numCls}
                            />
                            <button
                                onClick={() => {
                                    props.onApplyRotate();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Apply
                            </button>
                        </Row>
                        <Row label={`Size W × H (${lengthUnit(props.units)})`}>
                            <input
                                type="number"
                                step={0.01}
                                min={0.01}
                                value={displayLength(props.sizeW)}
                                onChange={(e) =>
                                    props.onSizeW(parseLength(e.target.value))
                                }
                                aria-label={`Width in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <input
                                type="number"
                                step={0.01}
                                min={0.01}
                                value={displayLength(props.sizeH)}
                                onChange={(e) =>
                                    props.onSizeH(parseLength(e.target.value))
                                }
                                aria-label={`Height in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <button
                                onClick={() =>
                                    props.onAspectLock(!props.aspectLock)
                                }
                                title="Lock aspect ratio"
                                aria-label="Lock aspect ratio"
                                aria-pressed={props.aspectLock}
                                className={`${applyCls} ${props.aspectLock ? '!bg-robin-500 !border-robin-500 !text-white' : ''}`}
                            >
                                {props.aspectLock ? (
                                    <Link2 size={14} />
                                ) : (
                                    <Unlink2 size={14} />
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    props.onApplyScale();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Apply Size
                            </button>
                        </Row>
                    </Section>
                    <Section title="Corners">
                        <Row label={`Radius (${lengthUnit(props.units)})`}>
                            <input
                                type="number"
                                min={0.5}
                                step={0.5}
                                value={displayLength(props.cornerRadius)}
                                onChange={(e) =>
                                    props.onCornerRadius(
                                        parseLength(e.target.value),
                                    )
                                }
                                aria-label={`Corner radius in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <button
                                onClick={() => {
                                    props.onApplyFillet();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Fillet
                            </button>
                            <button
                                onClick={() => {
                                    props.onApplyDogbone();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Dogbone
                            </button>
                            <button
                                onClick={() => {
                                    props.onApplyChamfer?.();
                                    close();
                                }}
                                disabled={!props.hasSelection}
                                className={applyCls}
                            >
                                Chamfer
                            </button>
                        </Row>
                    </Section>
                    <Section title="Offset">
                        <Row label={`Amount (${lengthUnit(props.units)})`}>
                            <input
                                type="number"
                                step={0.5}
                                value={displayLength(props.offsetAmount)}
                                onChange={(e) =>
                                    props.onOffsetAmount(
                                        parseLength(e.target.value),
                                    )
                                }
                                aria-label={`Offset amount in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <button
                                onClick={() => {
                                    props.onApplyOffset();
                                    close();
                                }}
                                disabled={!props.hasGeometry}
                                className={applyCls}
                            >
                                Offset
                            </button>
                        </Row>
                    </Section>
                    <Section title="Combine / Subtract">
                        <div className="flex flex-wrap gap-1">
                            {(
                                [
                                    'union',
                                    'difference',
                                    'intersection',
                                    'xor',
                                ] as BooleanOperation[]
                            ).map((op) => (
                                <button
                                    key={op}
                                    onClick={() => {
                                        props.onBoolean(op);
                                        close();
                                    }}
                                    disabled={!props.canBoolean}
                                    className={`${applyCls} capitalize disabled:opacity-30`}
                                >
                                    {
                                        {
                                            union: 'Combine',
                                            difference: 'Subtract',
                                            intersection: 'Keep overlap',
                                            xor: 'Remove overlap',
                                        }[op]
                                    }
                                </button>
                            ))}
                        </div>
                    </Section>
                    <Section title="Nest on sheet">
                        <Row label={`W × H (${lengthUnit(props.units)})`}>
                            <input
                                type="number"
                                value={displayLength(props.sheetW)}
                                onChange={(e) =>
                                    props.onSheetW(parseLength(e.target.value))
                                }
                                aria-label={`Sheet width in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <input
                                type="number"
                                value={displayLength(props.sheetH)}
                                onChange={(e) =>
                                    props.onSheetH(parseLength(e.target.value))
                                }
                                aria-label={`Sheet height in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                            <button
                                onClick={() => {
                                    props.onApplyNest();
                                    close();
                                }}
                                disabled={!props.hasGeometry}
                                className={applyCls}
                            >
                                Nest
                            </button>
                        </Row>
                    </Section>
                    {props.showTrace && (
                        <Section title="Bitmap">
                            <button
                                onClick={() => {
                                    props.onTrace();
                                    close();
                                }}
                                disabled={props.tracing}
                                className={`${applyCls} disabled:opacity-40`}
                            >
                                {props.tracing ? 'Tracing…' : 'Trace bitmap'}
                            </button>
                        </Section>
                    )}
                </div>
            )}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {title}
            </div>
            {children}
        </div>
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex-1">{label}</span>
            {children}
        </label>
    );
}
