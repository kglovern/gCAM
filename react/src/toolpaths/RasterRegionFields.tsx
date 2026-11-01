import { normalizedImageMask } from '../lib/image-mask';
import { useState } from 'react';
import { LaserMaskEditor } from './LaserMaskEditor';
import type { UnitSystem } from '../lib/units';
import type { LaserOptions } from './toolpathRequest';
import { FULL_IMAGE, validateImageRegion } from '../cam/raster-region.js';

export { normalizedImageMask } from '../lib/image-mask';
export function RasterRegionFields({
    options,
    onChange,
    maskShapes,
    image,
    units = 'metric',
    linkIds,
    linkError,
    maskShapeIds,
    onMaskLink,
}: {
    options: LaserOptions;
    onChange: (value: LaserOptions) => void;
    maskShapes: { x: number; y: number }[][];
    image?: {
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        dataUrl?: string;
    };
    units?: UnitSystem;
    linkIds?: string[];
    linkError?: string;
    maskShapeIds?: string[];
    onMaskLink?: (ids?: string[]) => void;
}) {
    const [editing, setEditing] = useState(false);
    const crop = options.imageCrop ?? FULL_IMAGE;
    let mask: { x: number; y: number }[][] | undefined;
    try {
        if (image && maskShapes.length)
            mask = normalizedImageMask(maskShapes, image);
    } catch {
        /* Open shapes cannot mask an image. */
    }
    return (
        <section
            className="space-y-2 rounded border border-slate-300 p-2 text-xs dark:border-robin-900"
            aria-label="Image crop and mask"
        >
            {editing && image?.dataUrl && options.imageMask?.length ? (
                <LaserMaskEditor
                    mask={options.imageMask}
                    crop={crop}
                    image={{ w: image.w, h: image.h, dataUrl: image.dataUrl }}
                    units={units}
                    onClose={() => setEditing(false)}
                    onApply={(imageMask) => {
                        onMaskLink?.();
                        onChange({
                            ...options,
                            imageMask,
                            ...(options.maskSourceIds
                                ? { maskSourceIds: [] }
                                : {}),
                        });
                        setEditing(false);
                    }}
                />
            ) : null}
            <div className="flex items-center justify-between">
                <span className="font-medium">Crop / mask</span>
                <button
                    type="button"
                    onClick={() => {
                        onMaskLink?.();
                        onChange({
                            ...options,
                            imageCrop: { ...FULL_IMAGE },
                            imageMask: [],
                            ...(options.maskSourceIds
                                ? { maskSourceIds: [] }
                                : {}),
                        });
                    }}
                    className="underline"
                >
                    Reset image region
                </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
                {(['left', 'bottom', 'right', 'top'] as const).map((key) => (
                    <label key={key} className="capitalize">
                        {key} (%)
                        <input
                            aria-label={`Crop ${key} percent`}
                            className="w-full rounded border border-slate-300 bg-white px-1 py-1 dark:border-robin-900 dark:bg-dark"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={Number((crop[key] * 100).toFixed(3))}
                            onChange={(e) =>
                                onChange({
                                    ...options,
                                    imageCrop: {
                                        ...crop,
                                        [key]: Number(e.target.value) / 100,
                                    },
                                })
                            }
                        />
                    </label>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!mask}
                    title="Select one image and closed shapes together, then choose Laser Raster."
                    onClick={() =>
                        mask &&
                        (() => {
                            onMaskLink?.();
                            onChange({
                                ...options,
                                imageMask: mask,
                                ...(options.maskSourceIds
                                    ? { maskSourceIds: [] }
                                    : {}),
                            });
                        })()
                    }
                    className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-robin-900"
                >
                    Use selected shapes as mask
                </button>
                {onMaskLink && (
                    <button
                        type="button"
                        disabled={!mask || !maskShapeIds?.length}
                        className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-robin-900"
                        onClick={() => onMaskLink(maskShapeIds)}
                    >
                        Link selected shapes as mask
                    </button>
                )}
                {Boolean(options.imageMask?.length) && image?.dataUrl && (
                    <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 dark:border-robin-900"
                        onClick={() => setEditing(true)}
                    >
                        Edit mask…
                    </button>
                )}
                {(Boolean(options.imageMask?.length) ||
                    Boolean(linkIds?.length)) && (
                    <button
                        type="button"
                        onClick={() => {
                            onMaskLink?.();
                            onChange({
                                ...options,
                                imageMask: [],
                                ...(options.maskSourceIds
                                    ? { maskSourceIds: [] }
                                    : {}),
                            });
                        }}
                        className="underline"
                    >
                        Remove mask
                    </button>
                )}
            </div>
            {linkError && (
                <p role="alert" className="text-red-600">
                    {linkError}
                </p>
            )}
            {Boolean(linkIds?.length) && (
                <p className="text-[10px] text-slate-500">
                    Linked to {linkIds?.length}{' '}
                    {linkIds?.length === 1 ? 'shape' : 'shapes'}. Independent
                    mask editing detaches the link.
                </p>
            )}
            <p className="text-[10px] text-slate-500">
                Original image is retained. Edit the mask independently, or
                reapply selected shapes to replace it.
            </p>
        </section>
    );
}
