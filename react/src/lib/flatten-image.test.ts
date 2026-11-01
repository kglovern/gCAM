import { flattenImageRegion, type FlattenImageRequest } from './flatten-image';
const source = () => ({
    width: 8,
    height: 4,
    data: new Uint8ClampedArray(
        Array.from({ length: 32 }, (_, i) => [
            (i * 7) % 256,
            (i * 13) % 256,
            (i * 23) % 256,
            i === 10 ? 128 : 255,
        ]).flat(),
    ),
});
const placement = { x: 10, y: 20, w: 80, h: 40 };
const rect = (l: number, b: number, r: number, t: number) => [
    { x: l, y: b },
    { x: r, y: b },
    { x: r, y: t },
    { x: l, y: t },
    { x: l, y: b },
];
test('crop keeps native RGBA without resampling and preserves physical pixel size', () => {
    const image = source(),
        before = image.data.slice();
    const result = flattenImageRegion({
        image,
        placement,
        crop: { left: 0.25, bottom: 0.25, right: 0.75, top: 0.75 },
    });
    expect(result).toMatchObject({
        width: 4,
        height: 2,
        widthMm: 40,
        heightMm: 20,
        placement: { x: 30, y: 30, w: 40, h: 20, rotation: 0 },
    });
    for (let y = 0; y < 2; y++)
        for (let x = 0; x < 4; x++)
            expect(
                Array.from(
                    result.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4),
                ),
            ).toEqual(
                Array.from(
                    image.data.slice(
                        ((y + 1) * 8 + x + 2) * 4,
                        ((y + 1) * 8 + x + 2) * 4 + 4,
                    ),
                ),
            );
    expect(image.data).toEqual(before);
});
test('even-odd masks clear hidden RGBA and retain holes and source alpha', () => {
    const image = source();
    const result = flattenImageRegion({
        image,
        placement,
        mask: [rect(0, 0, 1, 1), rect(0.25, 0.25, 0.75, 0.75)],
    });
    for (let y = 0; y < 4; y++)
        for (let x = 0; x < 8; x++) {
            const at = (y * 8 + x) * 4,
                hidden = y >= 1 && y < 3 && x >= 2 && x < 6;
            expect(Array.from(result.data.slice(at, at + 4))).toEqual(
                hidden
                    ? [0, 0, 0, 0]
                    : Array.from(image.data.slice(at, at + 4)),
            );
        }
});
test('mask bounds and fractional crop snap outward but do not expose pixels outside the requested region', () => {
    const result = flattenImageRegion({
        image: source(),
        placement,
        crop: { left: 0.2, bottom: 0, right: 0.8, top: 1 },
        mask: [rect(0, 0, 0.51, 1)],
    });
    expect(result.width).toBe(4);
    expect(result.widthMm).toBe(40);
    expect(result.data[3]).toBe(0); // pixel centre is left of the fractional crop
    expect(result.data[7]).toBeGreaterThan(0);
    expect(result.data[15]).toBe(0); // pixel centre is beyond the mask
});
test.each([0, 30, 90, -90])(
    'rotated crop %p retains each source pixel world position',
    (rotation) => {
        const result = flattenImageRegion({
            image: source(),
            placement: { ...placement, rotation },
            crop: { left: 0, bottom: 0, right: 0.5, top: 1 },
        });
        const a = (rotation * Math.PI) / 180,
            c = Math.cos(a),
            s = Math.sin(a);
        const expected = [
            [-40, -20],
            [0, -20],
            [0, 20],
            [-40, 20],
            [-40, -20],
        ].map(([x, y]) => ({ x: 50 + x * c - y * s, y: 40 + x * s + y * c }));
        result.points.forEach((p, i) => {
            expect(p.x).toBeCloseTo(expected[i].x, 12);
            expect(p.y).toBeCloseTo(expected[i].y, 12);
        });
    },
);
test('empty overlap, fully transparent regions and malformed sources fail without mutation', () => {
    const request = { image: source(), placement };
    expect(() =>
        flattenImageRegion({
            ...request,
            crop: { left: 0, bottom: 0, right: 0.2, top: 1 },
            mask: [rect(0.5, 0, 1, 1)],
        }),
    ).toThrow(/no source pixels/);
    const image = source();
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 0;
    expect(() => flattenImageRegion({ image, placement })).toThrow(
        /no visible/,
    );
    expect(() =>
        flattenImageRegion({
            ...request,
            image: { ...request.image, width: 32769 },
        }),
    ).toThrow(/16 million/);
    expect(() =>
        flattenImageRegion({
            ...request,
            placement: { ...placement, rotation: NaN },
        }),
    ).toThrow(/placement/);
    expect(() =>
        flattenImageRegion({ ...request, mask: [[{ x: 0, y: 0 }]] }),
    ).toThrow();
});
