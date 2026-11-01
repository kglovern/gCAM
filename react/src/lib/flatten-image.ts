import {
    FULL_IMAGE,
    validateImageRegion,
    scanIntervals,
} from '../cam/raster-region.js';
export interface FlattenImageRequest {
    image: { width: number; height: number; data: Uint8ClampedArray };
    crop?: { left: number; bottom: number; right: number; top: number };
    mask?: { x: number; y: number }[][];
    placement: {
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
    };
}
export function flattenImageRegion(
    request: FlattenImageRequest,
    onProgress: (percent: number) => void = () => {},
) {
    const { image, placement } = request,
        crop = request.crop ?? FULL_IMAGE,
        mask = request.mask ?? [];
    validateImageRegion(crop, mask);
    if (
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width > 32768 ||
        image.height > 32768 ||
        image.width * image.height > 16777216 ||
        !(image.data instanceof Uint8ClampedArray) ||
        image.data.length !== image.width * image.height * 4
    )
        throw new Error(
            'Flattening supports source images up to 16 million pixels and 32768 pixels per axis.',
        );
    if (
        ![
            placement.x,
            placement.y,
            placement.w,
            placement.h,
            placement.rotation ?? 0,
        ].every(Number.isFinite) ||
        placement.w <= 0 ||
        placement.h <= 0
    )
        throw new Error('Invalid source image placement.');
    let left = crop.left,
        right = crop.right,
        bottom = crop.bottom,
        top = crop.top;
    if (mask.length) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const poly of mask)
            for (const p of poly) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }
        left = Math.max(left, minX);
        right = Math.min(right, maxX);
        bottom = Math.max(bottom, minY);
        top = Math.min(top, maxY);
    }
    if (left >= right || bottom >= top)
        throw new Error('The image region contains no source pixels.');
    // Outward pixel snapping retains native pixel size and never resamples RGB.
    const x0 = Math.max(0, Math.floor(left * image.width + 1e-9)),
        x1 = Math.min(image.width, Math.ceil(right * image.width - 1e-9));
    const y0 = Math.max(0, Math.floor(bottom * image.height + 1e-9)),
        y1 = Math.min(image.height, Math.ceil(top * image.height - 1e-9));
    const width = x1 - x0,
        height = y1 - y0,
        data = new Uint8ClampedArray(width * height * 4);
    let visible = false;
    for (let row = 0; row < height; row++) {
        const sourceY = image.height - y1 + row,
            y = 1 - (sourceY + 0.5) / image.height;
        const ranges = mask.length ? scanIntervals(mask, y) : [[0, 1]];
        let interval = 0;
        for (let col = 0; col < width; col++) {
            const sourceX = x0 + col,
                x = (sourceX + 0.5) / image.width;
            while (interval < ranges.length && ranges[interval][1] < x)
                interval++;
            if (
                x < crop.left ||
                x > crop.right ||
                y < crop.bottom ||
                y > crop.top ||
                interval === ranges.length ||
                x < ranges[interval][0]
            )
                continue;
            const i = (sourceY * image.width + sourceX) * 4,
                at = (row * width + col) * 4;
            data[at] = image.data[i];
            data[at + 1] = image.data[i + 1];
            data[at + 2] = image.data[i + 2];
            data[at + 3] = image.data[i + 3];
            if (image.data[i + 3]) visible = true;
        }
        if (row % Math.max(1, Math.ceil(height / 80)) === 0)
            onProgress((100 * (row + 1)) / height);
    }
    if (!visible)
        throw new Error('The image region contains no visible source pixels.');
    const widthMm = (width / image.width) * placement.w,
        heightMm = (height / image.height) * placement.h;
    const dx = ((x0 + x1) / 2 / image.width - 0.5) * placement.w,
        dy = ((y0 + y1) / 2 / image.height - 0.5) * placement.h;
    const angle = ((placement.rotation ?? 0) * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
    const cx = placement.x + placement.w / 2 + dx * c - dy * s,
        cy = placement.y + placement.h / 2 + dx * s + dy * c;
    const next = {
        x: cx - widthMm / 2,
        y: cy - heightMm / 2,
        w: widthMm,
        h: heightMm,
        rotation: placement.rotation ?? 0,
    };
    const points = [
        [-widthMm / 2, -heightMm / 2],
        [widthMm / 2, -heightMm / 2],
        [widthMm / 2, heightMm / 2],
        [-widthMm / 2, heightMm / 2],
        [-widthMm / 2, -heightMm / 2],
    ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
    return { width, height, widthMm, heightMm, data, placement: next, points };
}
export type FlattenImageResult = ReturnType<typeof flattenImageRegion>;
