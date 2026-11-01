import { FULL_IMAGE, validateImageRegion } from '../cam/raster-region.js';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from '../components/floating/FloatingPanel';
import { UnitInput } from '../components/UnitInput';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { lengthUnit, type UnitSystem } from '../lib/units';
import {
    IDENTITY_MASK_TRANSFORM,
    transformImageMask,
    type MaskPoint,
    type MaskTransform,
} from './maskTransform';
export function LaserMaskEditor({
    mask,
    image,
    crop = FULL_IMAGE,
    units,
    onApply,
    onClose,
}: {
    mask: MaskPoint[][];
    image: { w: number; h: number; dataUrl: string };
    crop?: { left: number; bottom: number; right: number; top: number };
    units: UnitSystem;
    onApply(mask: MaskPoint[][]): void;
    onClose(): void;
}) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, true);
    const id = useId();
    const [draft, setDraft] = useState({ ...IDENTITY_MASK_TRANSFORM });
    const drag = useRef<{
        pointer: number;
        x: number;
        y: number;
        draft: MaskTransform;
    } | null>(null);
    let result: MaskPoint[][] = [],
        error = '';
    try {
        result = transformImageMask(mask, image, draft);
        validateImageRegion(crop, result);
    } catch (e) {
        error = (e as Error).message;
    }
    const path = result
        .map(
            (poly) =>
                poly
                    .map(
                        (p, i) =>
                            `${i ? 'L' : 'M'}${p.x * image.w},${(1 - p.y) * image.h}`,
                    )
                    .join(' ') + 'Z',
        )
        .join(' ');
    const point = (svg: SVGSVGElement, x: number, y: number) => {
        const matrix = svg.getScreenCTM();
        return matrix
            ? new DOMPoint(x, y).matrixTransform(matrix.inverse())
            : null;
    };
    const input =
        'w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-robin-900 dark:bg-dark';
    return createPortal(
        <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Edit image mask"
            tabIndex={-1}
            className="fixed inset-0 z-50 bg-black/50"
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                }
            }}
        >
            <FloatingPanel
                title="Edit image mask"
                label="Image mask editor"
                closeLabel="Cancel mask editing"
                placement="right"
                onClose={onClose}
                className="w-[720px] max-w-[calc(100vw-16px)] max-h-[calc(var(--app-height,100dvh)-16px)]"
            >
                <div className="space-y-3 p-3 text-xs">
                    <svg
                        viewBox={`0 0 ${image.w} ${image.h}`}
                        role="img"
                        aria-label="Mask position preview"
                        tabIndex={0}
                        className="h-[300px] w-full touch-none cursor-move rounded border border-slate-300 bg-white"
                        onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            const p = point(
                                e.currentTarget,
                                e.clientX,
                                e.clientY,
                            );
                            if (!p) return;
                            e.preventDefault();
                            e.currentTarget.focus();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            drag.current = {
                                pointer: e.pointerId,
                                x: p.x,
                                y: p.y,
                                draft,
                            };
                        }}
                        onPointerMove={(e) => {
                            const d = drag.current;
                            if (!d || d.pointer !== e.pointerId) return;
                            const p = point(
                                e.currentTarget,
                                e.clientX,
                                e.clientY,
                            );
                            if (p)
                                setDraft({
                                    ...d.draft,
                                    x: d.draft.x + p.x - d.x,
                                    y: d.draft.y - p.y + d.y,
                                });
                        }}
                        onPointerUp={(e) => {
                            if (drag.current?.pointer === e.pointerId)
                                drag.current = null;
                        }}
                        onPointerCancel={() => {
                            drag.current = null;
                        }}
                        onLostPointerCapture={() => {
                            drag.current = null;
                        }}
                        onKeyDown={(e) => {
                            const delta = e.shiftKey ? 0.1 : 1;
                            if (
                                [
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'ArrowUp',
                                    'ArrowDown',
                                ].includes(e.key)
                            ) {
                                e.preventDefault();
                                setDraft((d) => ({
                                    ...d,
                                    x:
                                        d.x +
                                        (e.key === 'ArrowLeft'
                                            ? -delta
                                            : e.key === 'ArrowRight'
                                              ? delta
                                              : 0),
                                    y:
                                        d.y +
                                        (e.key === 'ArrowDown'
                                            ? -delta
                                            : e.key === 'ArrowUp'
                                              ? delta
                                              : 0),
                                }));
                            }
                        }}
                    >
                        <title>
                            Drag the mask or use arrow keys to move it. Shift
                            moves 0.1 mm.
                        </title>
                        <defs>
                            <clipPath id={`${id}-crop`}>
                                <rect
                                    x={crop.left * image.w}
                                    y={(1 - crop.top) * image.h}
                                    width={(crop.right - crop.left) * image.w}
                                    height={(crop.top - crop.bottom) * image.h}
                                />
                            </clipPath>
                            <mask
                                id={id}
                                maskUnits="userSpaceOnUse"
                                x="0"
                                y="0"
                                width={image.w}
                                height={image.h}
                            >
                                <path
                                    d={path}
                                    fill="white"
                                    fillRule="evenodd"
                                />
                            </mask>
                        </defs>
                        <image
                            href={image.dataUrl}
                            width={image.w}
                            height={image.h}
                            preserveAspectRatio="none"
                            opacity="0.2"
                        />
                        <image
                            href={image.dataUrl}
                            width={image.w}
                            height={image.h}
                            preserveAspectRatio="none"
                            mask={`url(#${id})`}
                            clipPath={`url(#${id}-crop)`}
                        />
                        <path
                            d={path}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(['x', 'y'] as const).map((key) => (
                            <label key={key}>
                                Move {key.toUpperCase()} ({lengthUnit(units)})
                                <UnitInput
                                    aria-label={`Mask move ${key.toUpperCase()}`}
                                    className={input}
                                    units={units}
                                    valueMm={draft[key]}
                                    onChangeMm={(value) =>
                                        setDraft((d) => ({
                                            ...d,
                                            [key]: value,
                                        }))
                                    }
                                />
                            </label>
                        ))}
                        <label>
                            Rotate (°)
                            <input
                                aria-label="Mask rotation"
                                className={input}
                                type="number"
                                min="-360"
                                max="360"
                                value={draft.angle}
                                onChange={(e) =>
                                    setDraft((d) => ({
                                        ...d,
                                        angle: Number(e.target.value),
                                    }))
                                }
                            />
                        </label>
                        {(['scaleX', 'scaleY'] as const).map((key) => (
                            <label key={key}>
                                Scale {key === 'scaleX' ? 'X' : 'Y'} (%)
                                <input
                                    aria-label={`Mask scale ${key === 'scaleX' ? 'X' : 'Y'}`}
                                    className={input}
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={draft[key] * 100}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            [key]: Number(e.target.value) / 100,
                                        }))
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    <p className="text-slate-500">
                        Drag to move · Arrow keys: 1 mm · Shift: 0.1 mm
                    </p>
                    {error && (
                        <p role="alert" className="text-red-600">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 border-t pt-2">
                        <button
                            type="button"
                            className="mr-auto underline"
                            onClick={() =>
                                setDraft({ ...IDENTITY_MASK_TRANSFORM })
                            }
                        >
                            Reset mask transform
                        </button>
                        <button
                            type="button"
                            className="rounded border px-3 py-2"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={Boolean(error)}
                            className="rounded bg-robin-500 px-3 py-2 font-medium text-white disabled:opacity-40"
                            onClick={() => onApply(result)}
                        >
                            Apply mask
                        </button>
                    </div>
                </div>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
