import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import {
    fitImageViewport,
    zoomImageViewport,
    type ImageViewport,
} from './imageViewport';
import { useStableCallback } from '../lib/useStableCallback';
import type { LaserOptions } from './toolpathRequest';
type Cache = {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    crop: NonNullable<LaserOptions['imageCrop']>;
};
export function LaserImageCompare({
    source,
    cache,
    invert,
    onInvert,
}: {
    source: HTMLImageElement;
    cache: Cache | null;
    invert: boolean;
    onInvert(value: boolean): void;
}) {
    const [size, setSize] = useState({ width: 480, height: 224 }),
        [view, setView] = useState<ImageViewport>({ scale: 1, x: 0, y: 0 }),
        [fitted, setFitted] = useState(true);
    const previous = useRef({
        width: 0,
        height: 0,
        paneWidth: size.width,
        paneHeight: size.height,
    });
    const measure = useCallback(
        (width: number, height: number) =>
            setSize((old) =>
                old.width === width && old.height === height
                    ? old
                    : { width, height },
            ),
        [],
    );
    const fit = () => {
        if (cache) {
            setFitted(true);
            setView(
                fitImageViewport(
                    cache.width,
                    cache.height,
                    size.width,
                    size.height,
                ),
            );
        }
    };
    const zoom = (
        factor: number,
        anchor = { x: size.width / 2, y: size.height / 2 },
    ) => {
        setFitted(false);
        setView((v) => zoomImageViewport(v, factor, anchor));
    };
    const actual = () => {
        setFitted(false);
        setView((v) =>
            zoomImageViewport(v, 1 / v.scale, {
                x: size.width / 2,
                y: size.height / 2,
            }),
        );
    };
    useEffect(() => {
        if (!cache) return;
        const old = previous.current,
            changed = old.width !== cache.width || old.height !== cache.height;
        if (fitted || changed) {
            setView(
                fitImageViewport(
                    cache.width,
                    cache.height,
                    size.width,
                    size.height,
                ),
            );
            if (changed) setFitted(true);
        } else if (
            old.paneWidth !== size.width ||
            old.paneHeight !== size.height
        )
            setView((v) => ({
                ...v,
                x: v.x + (size.width - old.paneWidth) / 2,
                y: v.y + (size.height - old.paneHeight) / 2,
            }));
        previous.current = {
            width: cache.width,
            height: cache.height,
            paneWidth: size.width,
            paneHeight: size.height,
        };
    }, [cache?.width, cache?.height, size.width, size.height, fitted]);
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={fit}
                    className="rounded border px-2 py-1"
                >
                    Fit
                </button>
                <button
                    type="button"
                    onClick={actual}
                    title="Actual processed pixels"
                    className="rounded border px-2 py-1"
                >
                    1:1
                </button>
                <button
                    type="button"
                    aria-label="Zoom image out"
                    onClick={() => zoom(1 / 1.5)}
                    className="rounded border px-2 py-1"
                >
                    −
                </button>
                <span aria-label="Image zoom">
                    {Number((view.scale * 100).toPrecision(3))}%
                </span>
                <button
                    type="button"
                    aria-label="Zoom image in"
                    onClick={() => zoom(1.5)}
                    className="rounded border px-2 py-1"
                >
                    +
                </button>
                <label className="ml-auto flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={invert}
                        onChange={(e) => onInvert(e.target.checked)}
                    />
                    Invert display
                </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {(['Source region', 'Processed image'] as const).map(
                    (label, i) => (
                        <div key={label}>
                            <p className="mb-1 font-medium">{label}</p>
                            <CompareCanvas
                                label={label}
                                source={source}
                                cache={cache}
                                processed={i === 1}
                                inverted={i === 1 && invert}
                                view={view}
                                setView={setView}
                                free={() => setFitted(false)}
                                onZoom={zoom}
                                onFit={fit}
                                onActual={actual}
                                onSize={i === 0 ? measure : undefined}
                            />
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}
function CompareCanvas({
    label,
    source,
    cache,
    processed,
    inverted,
    view,
    setView,
    free,
    onZoom,
    onFit,
    onActual,
    onSize,
}: {
    label: string;
    source: HTMLImageElement;
    cache: Cache | null;
    processed: boolean;
    inverted: boolean;
    view: ImageViewport;
    setView: Dispatch<SetStateAction<ImageViewport>>;
    free(): void;
    onZoom(factor: number, anchor?: { x: number; y: number }): void;
    onFit(): void;
    onActual(): void;
    onSize?: (w: number, h: number) => void;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        pointers = useRef(new Map<number, { x: number; y: number }>());
    const [size, setSize] = useState({ width: 480, height: 224, dpr: 1 });
    const notify = useStableCallback((w: number, h: number) => onSize?.(w, h)),
        zoom = useStableCallback(onZoom);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const resize = () => {
            const r = canvas.getBoundingClientRect(),
                width = Math.max(20, r.width - 2 * canvas.clientLeft),
                height = Math.max(20, r.height - 2 * canvas.clientTop),
                dpr = Math.min(3, window.devicePixelRatio || 1);
            setSize((old) =>
                old.width === width && old.height === height && old.dpr === dpr
                    ? old
                    : { width, height, dpr },
            );
            notify(width, height);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        window.addEventListener('resize', resize);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', resize);
        };
    }, [notify]);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = canvas.getBoundingClientRect();
            zoom(Math.exp(Math.max(-1, Math.min(1, -e.deltaY * 0.002))), {
                x: e.clientX - r.left - canvas.clientLeft,
                y: e.clientY - r.top - canvas.clientTop,
            });
        };
        canvas.addEventListener('wheel', wheel, { passive: false });
        return () => canvas.removeEventListener('wheel', wheel);
    }, [zoom]);
    useEffect(() => {
        const canvas = ref.current,
            ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const width = Math.round(size.width * size.dpr),
            height = Math.round(size.height * size.dpr);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, size.width, size.height);
        if (!cache) return;
        ctx.imageSmoothingEnabled = view.scale < 1;
        const { crop } = cache;
        const x = view.x,
            y = view.y,
            w = cache.width * view.scale,
            h = cache.height * view.scale;
        if (processed) ctx.drawImage(cache.canvas, x, y, w, h);
        else
            ctx.drawImage(
                source,
                crop.left * source.naturalWidth,
                (1 - crop.top) * source.naturalHeight,
                (crop.right - crop.left) * source.naturalWidth,
                (crop.top - crop.bottom) * source.naturalHeight,
                x,
                y,
                w,
                h,
            );
    }, [source, cache, view, size]);
    const point = (e: { clientX: number; clientY: number }) => {
        const r = ref.current!.getBoundingClientRect();
        return {
            x: e.clientX - r.left - ref.current!.clientLeft,
            y: e.clientY - r.top - ref.current!.clientTop,
        };
    };
    return (
        <canvas
            ref={ref}
            role="img"
            tabIndex={0}
            aria-label={label}
            data-view={JSON.stringify(view)}
            className="h-56 w-full cursor-grab touch-none rounded border border-slate-300 bg-white active:cursor-grabbing"
            style={{ filter: inverted ? 'invert(1)' : undefined }}
            title="Drag to pan; scroll or +/− to zoom. 0 fits; 1 shows actual pixels."
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.focus();
                pointers.current.set(e.pointerId, point(e));
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
                const old = pointers.current.get(e.pointerId);
                if (!old) return;
                const before = [...pointers.current.values()];
                pointers.current.set(e.pointerId, point(e));
                const after = [...pointers.current.values()];
                free();
                if (before.length === 2 && after.length === 2) {
                    const center = (p: typeof before) => ({
                            x: (p[0].x + p[1].x) / 2,
                            y: (p[0].y + p[1].y) / 2,
                        }),
                        a = center(before),
                        b = center(after),
                        distance = (p: typeof before) =>
                            Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
                        d = distance(before);
                    setView((v) => {
                        const next = zoomImageViewport(
                            v,
                            d > 1 ? distance(after) / d : 1,
                            a,
                        );
                        return {
                            ...next,
                            x: next.x + b.x - a.x,
                            y: next.y + b.y - a.y,
                        };
                    });
                } else {
                    const next = point(e);
                    setView((v) => ({
                        ...v,
                        x: v.x + next.x - old.x,
                        y: v.y + next.y - old.y,
                    }));
                }
            }}
            onPointerUp={(e) => {
                pointers.current.delete(e.pointerId);
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
            onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
            onKeyDown={(e) => {
                if (
                    [
                        'ArrowLeft',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowDown',
                    ].includes(e.key)
                ) {
                    e.preventDefault();
                    free();
                    setView((v) => ({
                        ...v,
                        x:
                            v.x +
                            (e.key === 'ArrowLeft'
                                ? -20
                                : e.key === 'ArrowRight'
                                  ? 20
                                  : 0),
                        y:
                            v.y +
                            (e.key === 'ArrowUp'
                                ? -20
                                : e.key === 'ArrowDown'
                                  ? 20
                                  : 0),
                    }));
                } else if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    onZoom(1.5);
                } else if (e.key === '-') {
                    e.preventDefault();
                    onZoom(1 / 1.5);
                } else if (e.key === '0' || e.key === 'Home') {
                    e.preventDefault();
                    onFit();
                } else if (e.key === '1') {
                    e.preventDefault();
                    onActual();
                }
            }}
        />
    );
}
export type LaserImageCompareCache = Cache;
