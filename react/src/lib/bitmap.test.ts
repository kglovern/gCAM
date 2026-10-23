/**
 * Tests: wide image caps at 80mm preserving aspect; tall image caps at 120mm height; placement centers on the given view center.
 */
import { isBitmapFile, placeBitmap } from './bitmap';

test('routes DXF drawings to vector import despite image MIME types', () => {
    for (const type of ['image/vnd.dxf', 'image/x-dxf', 'image/dxf']) {
        expect(isBitmapFile(new File(['DXF'], 'drawing.dxf', { type }))).toBe(false);
        expect(isBitmapFile(new File(['DXF'], 'drawing', { type }))).toBe(false);
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
