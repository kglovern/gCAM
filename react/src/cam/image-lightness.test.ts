import { imageLightness } from './image-lightness.js';
import { laserOptions } from './laser.js';

const image = (values: number[], alpha = values.map(() => 255)) => ({
    width: values.length,
    height: 1,
    data: new Uint8ClampedArray(values.flatMap((v, i) => [v, v, v, alpha[i]])),
});

test('disabled filters preserve original sampling exactly', () => {
    const source = image([30, 120, 210]);
    expect(imageLightness(source, 1, 0, 0, 0)).toBeCloseTo(120 / 255, 14);
});

test('Gaussian smoothing and unsharp masking use source-pixel neighbours', () => {
    const source = image([0, 128, 128]);
    expect(imageLightness(source, 1, 0, 1, 0)).toBeCloseTo(96 / 255);
    expect(imageLightness(source, 1, 0, 0, 1)).toBeCloseTo(160 / 255);
    expect(imageLightness(source, 0, 0, 0, 2)).toBe(0);
    expect([...source.data]).toEqual([...image([0, 128, 128]).data]);
});

test('transparent RGB cannot bleed into opaque neighbours; edges stay constant', () => {
    expect(
        imageLightness(image([0, 128, 0], [0, 255, 0]), 1, 0, 1, 0),
    ).toBeCloseTo(128 / 255);
    expect(imageLightness(image([80]), 0, 0, 1, 2)).toBeCloseTo(80 / 255);
});

test.each([
    { smoothing: -1 },
    { smoothing: 1.1 },
    { sharpening: 3 },
    { sharpening: NaN },
])('rejects invalid filter settings %p', (options) => {
    expect(() => laserOptions(options)).toThrow(/Invalid laser/);
});

test.each([
    ['luminance', 0.299],
    ['average', 1 / 3],
    ['red', 1],
    ['green', 0],
    ['blue', 0],
    ['minimum', 0],
    ['maximum', 1],
])('grayscale %s samples the selected channels', (method, expected) => {
    const source = { width: 1, height: 1, data: [255, 0, 0, 255] };
    expect(imageLightness(source, 0, 0, 0, 0, method as string)).toBeCloseTo(
        expected as number,
    );
    expect(imageLightness(source, 0, 0, 1, 0, method as string)).toBeCloseTo(
        expected as number,
    );
});
