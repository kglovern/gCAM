import { tracePixels } from './trace-pixels';
import { preprocessImageData } from './trace';
const options = {
    brightness: 0,
    contrast: 0,
    threshold: 128,
    invert: false,
    turdsize: 0,
};
function image(visibleColor = 0, transparentBackground = false) {
    const data = new Uint8ClampedArray(20 * 10 * 4);
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 20; x++) {
            const i = (y * 20 + x) * 4,
                visible = x >= 2 && x < 8 && y >= 1 && y < 7;
            data.fill(visible ? visibleColor : 255, i, i + 3);
            data[i + 3] = visible || !transparentBackground ? 255 : 0;
        }
    return { width: 20, height: 10, data };
}
const placement = { x: 100, y: 200, width: 100, height: 50 };
test('a traced ring retains its internal hole with opposing winding', () => {
    const data = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    for (let y = 2; y < 18; y++)
        for (let x = 2; x < 18; x++) {
            if (x >= 8 && x < 12 && y >= 8 && y < 12) continue;
            data.fill(0, (y * 20 + x) * 4, (y * 20 + x) * 4 + 3);
        }
    const loops = tracePixels({
        image: { width: 20, height: 20, data },
        placement,
        options,
    });
    expect(loops).toHaveLength(2);
    const areas = loops.map(({ points }) =>
        points
            .slice(1)
            .reduce((a, p, i) => a + points[i].x * p.y - p.x * points[i].y, 0),
    );
    expect(areas[0] * areas[1]).toBeLessThan(0);
});
test('real tracing retains physical placement, closure and rotation about the bitmap centre', () => {
    const plain = tracePixels({ image: image(), placement, options });
    const rotated = tracePixels({
        image: image(),
        placement: { ...placement, rotation: 90 },
        options,
    });
    expect(plain).toHaveLength(1);
    expect(rotated).toHaveLength(1);
    const points = plain[0].points;
    expect(points[points.length - 1]).toEqual(points[0]);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(110, 1);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(140, 1);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(215, 1);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(245, 1);
    expect(rotated[0].points).toHaveLength(points.length);
    points.forEach((p, i) => {
        expect(rotated[0].points[i].x).toBeCloseTo(150 - (p.y - 225), 7);
        expect(rotated[0].points[i].y).toBeCloseTo(225 + (p.x - 150), 7);
    });
});
test('transparency tracing ignores visible colour while normal tracing composites against white', () => {
    expect(
        tracePixels({ image: image(255, true), placement, options }),
    ).toHaveLength(0);
    const white = tracePixels({
        image: image(255, true),
        placement,
        options: { ...options, traceTransparency: true },
    });
    const black = tracePixels({
        image: image(0, true),
        placement,
        options: { ...options, traceTransparency: true },
    });
    expect(white).toHaveLength(1);
    expect(white).toEqual(black);
});
test.each([false, true])(
    'hidden black RGB never becomes artwork during normal tracing, inverted=%s',
    (invert) => {
        const hidden = { width: 3, height: 3, data: new Uint8ClampedArray(36) };
        expect(
            tracePixels({
                image: hidden,
                placement,
                options: { ...options, invert },
            }),
        ).toHaveLength(0);
    },
);
test('alpha blending and lower brightness cutoff are applied before binary tracing', () => {
    const pixels = {
        width: 3,
        height: 1,
        data: new Uint8ClampedArray([0, 0, 0, 127, 0, 0, 0, 128, 0, 0, 0, 0]),
    };
    preprocessImageData(pixels, options);
    expect([pixels.data[0], pixels.data[4], pixels.data[8]]).toEqual([
        255, 0, 255,
    ]);
    expect([pixels.data[3], pixels.data[7], pixels.data[11]]).toEqual([
        255, 255, 255,
    ]);
    const range = {
        width: 3,
        height: 1,
        data: new Uint8ClampedArray([
            20, 20, 20, 255, 100, 100, 100, 255, 200, 200, 200, 255,
        ]),
    };
    preprocessImageData(range, { ...options, cutoff: 80 });
    expect([range.data[0], range.data[4], range.data[8]]).toEqual([
        255, 0, 255,
    ]);
});
test.each([
    { threshold: -1 },
    { threshold: null },
    { cutoff: 129 },
    { turdsize: -1 },
    { brightness: Infinity },
])('invalid trace options fail explicitly: %j', (patch) => {
    expect(() =>
        tracePixels({
            image: image(),
            placement,
            options: { ...options, ...patch },
        }),
    ).toThrow('settings');
});
test('pixel and world limits reject malformed or oversized work before tracing', () => {
    expect(() =>
        tracePixels({
            image: {
                width: 4097,
                height: 4097,
                data: new Uint8ClampedArray(0),
            },
            placement,
            options,
        }),
    ).toThrow('pixels');
    expect(() =>
        tracePixels({
            image: { ...image(), data: new Uint8ClampedArray(4) },
            placement,
            options,
        }),
    ).toThrow('pixel data');
    expect(() =>
        tracePixels({
            image: image(),
            placement: { ...placement, rotation: NaN },
            options,
        }),
    ).toThrow('placement');
});

test('trace fitting defaults preserve output and zero smoothness preserves polygon corners', () => {
    const defaults = tracePixels({ image: image(), placement, options });
    expect(
        tracePixels({
            image: image(),
            placement,
            options: { ...options, smoothness: 1, optimize: 0.2 },
        }),
    ).toEqual(defaults);
    const sharp = tracePixels({
        image: image(),
        placement,
        options: { ...options, smoothness: 0, optimize: 0 },
    });
    expect(sharp).toHaveLength(1);
    expect(
        sharp[0].points.every(
            (p) =>
                Math.abs(p.x - 110) < 0.01 ||
                Math.abs(p.x - 140) < 0.01 ||
                Math.abs(p.y - 215) < 0.01 ||
                Math.abs(p.y - 245) < 0.01,
        ),
    ).toBe(true);
    expect(defaults[0].points.length).toBeGreaterThan(sharp[0].points.length);
});

test.each([
    { smoothness: -0.01 },
    { smoothness: 1.34 },
    { smoothness: NaN },
    { optimize: -0.01 },
    { optimize: 1.01 },
    { optimize: Infinity },
])('rejects invalid trace fitting controls %p', (fitting) => {
    expect(() =>
        tracePixels({
            image: image(),
            placement,
            options: { ...options, ...fitting },
        }),
    ).toThrow('Invalid bitmap trace settings');
});

test('curve optimization changes fitting while preserving circular bounds and its hole', () => {
    const makeImage = () => {
        const data = new Uint8ClampedArray(128 * 128 * 4).fill(255);
        for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
                const radius = Math.hypot(x - 63.5, y - 63.5);
                if (radius < 52 && radius > 20)
                    data.fill(0, (y * 128 + x) * 4, (y * 128 + x) * 4 + 3);
            }
        return { width: 128, height: 128, data };
    };
    const run = (optimize: number) =>
        tracePixels({
            image: makeImage(),
            placement,
            options: { ...options, optimize },
        });
    const unmerged = run(0),
        merged = run(1);
    expect(unmerged).toHaveLength(2);
    expect(merged).toHaveLength(2);
    expect(merged).not.toEqual(unmerged);
    for (let i = 0; i < 2; i++) {
        for (const axis of ['x', 'y'] as const) {
            expect(
                Math.abs(
                    Math.min(...merged[i].points.map((p) => p[axis])) -
                        Math.min(...unmerged[i].points.map((p) => p[axis])),
                ),
            ).toBeLessThan(1);
            expect(
                Math.abs(
                    Math.max(...merged[i].points.map((p) => p[axis])) -
                        Math.max(...unmerged[i].points.map((p) => p[axis])),
                ),
            ).toBeLessThan(1);
        }
    }
});

test('a brightness band traces only its selected midtone object', () => {
    const data = new Uint8ClampedArray(60 * 20 * 4).fill(255);
    for (let y = 4; y < 16; y++)
        for (let x = 4; x < 56; x++) {
            if (x % 20 >= 16 || x % 20 < 4) continue;
            const tone = x < 20 ? 20 : x < 40 ? 100 : 200;
            data.fill(tone, (y * 60 + x) * 4, (y * 60 + x) * 4 + 3);
        }
    const run = (cutoff: number) =>
        tracePixels({
            image: { width: 60, height: 20, data: new Uint8ClampedArray(data) },
            placement: { x: 0, y: 0, width: 60, height: 20 },
            options: { ...options, cutoff, threshold: 150, smoothness: 0 },
        });
    expect(run(0)).toHaveLength(2);
    const band = run(50);
    expect(band).toHaveLength(1);
    expect(Math.min(...band[0].points.map((p) => p.x))).toBeCloseTo(24, 1);
    expect(Math.max(...band[0].points.map((p) => p.x))).toBeCloseTo(36, 1);
    expect(run(150)).toHaveLength(0);
});
