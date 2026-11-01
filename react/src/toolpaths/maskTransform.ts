import { FULL_IMAGE, validateImageRegion } from '../cam/raster-region.js';
export type MaskPoint = { x: number; y: number };
export type MaskTransform = {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    angle: number;
};
export const IDENTITY_MASK_TRANSFORM: MaskTransform = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
};
export function transformImageMask(
    mask: MaskPoint[][],
    image: { w: number; h: number },
    transform: MaskTransform,
) {
    validateImageRegion(FULL_IMAGE, mask);
    if (
        !mask.length ||
        !Number.isFinite(image.w) ||
        !Number.isFinite(image.h) ||
        image.w <= 0 ||
        image.h <= 0 ||
        !Object.values(transform).every(Number.isFinite) ||
        Math.abs(transform.x) > 1e6 ||
        Math.abs(transform.y) > 1e6 ||
        transform.scaleX < 0.01 ||
        transform.scaleX > 100 ||
        transform.scaleY < 0.01 ||
        transform.scaleY > 100 ||
        Math.abs(transform.angle) > 360
    )
        throw new Error('Invalid mask size or position.');
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
    const cx = ((minX + maxX) * image.w) / 2,
        cy = ((minY + maxY) * image.h) / 2,
        r = (transform.angle * Math.PI) / 180,
        c = Math.cos(r),
        s = Math.sin(r);
    const result = mask.map((poly) =>
        poly.map((p) => {
            const x = (p.x * image.w - cx) * transform.scaleX,
                y = (p.y * image.h - cy) * transform.scaleY;
            return {
                x: (cx + x * c - y * s + transform.x) / image.w,
                y: (cy + x * s + y * c + transform.y) / image.h,
            };
        }),
    );
    validateImageRegion(FULL_IMAGE, result);
    return result;
}
