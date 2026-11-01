/**
 * Tests: wide image caps at 80mm preserving aspect; tall image caps at 120mm height; placement centers on the given view center.
 */
import { isBitmapFile, placeBitmap } from './bitmap';

test('embedded physical size preserves dimensions and oversize artwork rather than fitting it to stock', () => {
    const p = placeBitmap(
        128,
        64,
        0,
        0,
        { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        { wMm: 40, hMm: 30 },
    );
    expect(p).toEqual({ x: -10, y: -10, wMm: 40, hMm: 30 });
    expect(
        placeBitmap(128, 64, 50, 50, undefined, { wMm: 10, hMm: 20 }),
    ).toEqual({ x: 45, y: 40, wMm: 10, hMm: 20 });
    expect(() =>
        placeBitmap(128, 64, 0, 0, undefined, { wMm: NaN, hMm: 1 }),
    ).toThrow('physical size');
});

test('routes DXF drawings to vector import despite image MIME types', () => {
    for (const type of ['image/vnd.dxf', 'image/x-dxf', 'image/dxf']) {
        expect(isBitmapFile(new File(['DXF'], 'drawing.dxf', { type }))).toBe(
            false,
        );
        expect(isBitmapFile(new File(['DXF'], 'drawing', { type }))).toBe(
            false,
        );
    }
});

test('routes SVG files to vector import even when the browser reports an image MIME type', () => {
    expect(
        isBitmapFile(
            new File(['<svg />'], 'drawing.svg', { type: 'image/svg+xml' }),
        ),
    ).toBe(false);
    expect(
        isBitmapFile(
            new File(['<svg />'], 'drawing', { type: 'image/svg+xml' }),
        ),
    ).toBe(false);
});

test('keeps raster images in the bitmap import route', () => {
    expect(
        isBitmapFile(new File(['pixels'], 'photo.png', { type: 'image/png' })),
    ).toBe(true);
});

test('wide image caps at 80mm preserving aspect', () => {
    const p = placeBitmap(200, 100);
    expect(p.wMm).toBeCloseTo(80);
    expect(p.hMm).toBeCloseTo(40);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(30);
});

test('tall image caps at 120mm height', () => {
    const p = placeBitmap(100, 400);
    expect(p.hMm).toBeCloseTo(120);
    expect(p.wMm).toBeCloseTo(30);
});

test('placement centers on the given view center', () => {
    const p = placeBitmap(100, 100, 0, 0);
    expect(p.x).toBeCloseTo(-40);
    expect(p.y).toBeCloseTo(-40);
});

test('stock placement fits tall images without changing aspect ratio or stock origin', () => {
    expect(
        placeBitmap(480, 640, 45, 40, {
            minX: 0,
            minY: 0,
            maxX: 810,
            maxY: 855,
        }).y,
    ).toBe(0);
    const small = placeBitmap(480, 640, 0, 0, {
        minX: -10,
        minY: -15,
        maxX: 10,
        maxY: 15,
    });
    expect(small.wMm / small.hMm).toBeCloseTo(0.75);
    expect(small.wMm).toBe(20);
    expect(small.x).toBe(-10);
    expect(small.y).toBeGreaterThanOrEqual(-15);
    expect(small.y + small.hMm).toBeLessThanOrEqual(15);
});
