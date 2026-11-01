import {
    createImageLightnessSampler,
    imageLightness,
} from './image-lightness.js';
import { laserOptions } from './laser.js';
const source = {
    width: 130,
    height: 70,
    data: new Uint8ClampedArray(130 * 70 * 4),
};
for (let y = 0; y < 70; y++)
    for (let x = 0; x < 130; x++) {
        const i = (y * 130 + x) * 4;
        source.data.set(
            [
                (x * 17 + y * 3) % 256,
                (x * 5 + y * 29) % 256,
                (x * 31 + y * 7) % 256,
                (x + y) % 5 === 0 ? 0 : (x * 13 + y * 19) % 256,
            ],
            i,
        );
    }
function reference(
    x: number,
    y: number,
    r: number,
    edge: number,
    smoothing: number,
    sharpening: number,
    denoise: number,
) {
    let total = 0,
        weights = 0;
    const gray = (i: number) =>
        (source.data[i] + source.data[i + 1] + source.data[i + 2]) / (3 * 255);
    for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
            const px = Math.max(0, Math.min(129, x + dx)),
                py = Math.max(0, Math.min(69, y + dy)),
                i = (py * 130 + px) * 4;
            const a = source.data[i + 3] / 255,
                w =
                    Math.exp(-(dx * dx + dy * dy) / (2 * (r / 2) ** 2)) *
                    (edge ? 1 : a);
            total += (edge ? gray(i) * a + 1 - a : gray(i)) * w;
            weights += w;
        }
    const original = gray((y * 130 + x) * 4),
        blurred = weights ? total / weights : original,
        d = original - blurred;
    const filtered = Math.max(
        0,
        Math.min(
            1,
            original +
                smoothing * (blurred - original) +
                sharpening * Math.sign(d) * Math.max(0, Math.abs(d) - denoise),
        ),
    );
    return edge
        ? 1 - Math.min(1, Math.abs(filtered - blurred) * 4 * edge)
        : filtered;
}
test.each([2, 4, 16])(
    'separable radius %p agrees with independent full 2D Gaussian across tile and image boundaries',
    (radius) => {
        const before = source.data.slice();
        for (const edge of [0, 1]) {
            const sampler = createImageLightnessSampler(
                source,
                laserOptions({
                    filterRadius: radius,
                    smoothing: 0.3,
                    sharpening: 1.2,
                    sharpeningDenoise: 0.04,
                    grayscale: 'average',
                    imageMode: edge ? 'edge' : 'grayscale',
                }),
            );
            for (const y of [0, 63, 64, 69, 0])
                for (const x of [0, 63, 64, 129, 0])
                    expect(sampler(x, y)).toBeCloseTo(
                        reference(x, y, radius, edge, 0.3, 1.2, 0.04),
                        12,
                    );
        }
        expect(source.data).toEqual(before);
    },
);
test('default sampler is exactly the old filter including alpha, image edges and edge mode', () => {
    for (const edge of [0, 1]) {
        const sampler = createImageLightnessSampler(
            source,
            laserOptions({
                smoothing: 0.3,
                sharpening: 1.2,
                imageMode: edge ? 'edge' : 'grayscale',
            }),
        );
        for (const [x, y] of [
            [0, 0],
            [64, 64],
            [129, 69],
        ])
            expect(sampler(x, y)).toBe(
                imageLightness(source, x, y, 0.3, 1.2, 'luminance', edge),
            );
    }
});
test('denoise suppresses small sharpening differences without changing the source or base tone', () => {
    const img = {
        width: 3,
        height: 1,
        data: new Uint8ClampedArray([
            128, 128, 128, 255, 130, 130, 130, 255, 128, 128, 128, 255,
        ]),
    };
    const normal = createImageLightnessSampler(
        img,
        laserOptions({ sharpening: 2 }),
    );
    const quiet = createImageLightnessSampler(
        img,
        laserOptions({ sharpening: 2, sharpeningDenoise: 0.02 }),
    );
    expect(normal(1, 0)).toBeGreaterThan(130 / 255);
    expect(quiet(1, 0)).toBeCloseTo(130 / 255, 14);
});
test.each([
    { filterRadius: 0 },
    { filterRadius: 17 },
    { filterRadius: 1.5 },
    { filterRadius: NaN },
    { sharpeningDenoise: -0.1 },
    { sharpeningDenoise: 1.1 },
    { sharpeningDenoise: NaN },
])('invalid enhancement input is rejected %p', (o) =>
    expect(() => laserOptions(o)).toThrow(/Invalid laser/),
);
