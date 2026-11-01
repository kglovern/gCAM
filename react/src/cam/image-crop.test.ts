import { resolveImageCrop } from './raster-region.js';
test('ordinary crop retains the exact normalized region', () => {
    const crop = { left: 0.14, bottom: 0.26, right: 0.76, top: 0.9 };
    expect(resolveImageCrop(crop, 10, 8, false)).toBe(crop);
});
test('source-pixel mode expands partial edge pixels to the same crop as CAM', () => {
    expect(
        resolveImageCrop(
            { left: 0.14, bottom: 0.26, right: 0.76, top: 0.9 },
            10,
            8,
            true,
        ),
    ).toEqual({ left: 0.1, bottom: 0.25, right: 0.8, top: 1 });
    expect(
        resolveImageCrop(
            { left: 0.2, bottom: 0.2, right: 0.8, top: 0.8 },
            10,
            10,
            true,
        ),
    ).toEqual({ left: 0.2, bottom: 0.2, right: 0.8, top: 0.8 });
});
