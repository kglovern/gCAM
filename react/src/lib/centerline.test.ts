import { tracePixels } from './trace-pixels';
const options = {
    brightness: 0,
    contrast: 0,
    threshold: 128,
    invert: false,
    turdsize: 0,
    traceMode: 'centerline' as const,
};
function draw(
    width: number,
    height: number,
    ink: (x: number, y: number) => boolean,
) {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            if (ink(x, y))
                data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    return { width, height, data };
}
const run = (image: ReturnType<typeof draw>, extra = {}) =>
    tracePixels({
        image,
        placement: { x: 0, y: 0, width: image.width, height: image.height },
        options: { ...options, ...extra },
    });
test('thick horizontal line becomes one open centre stroke without an outline return', () => {
    const result = run(
        draw(40, 20, (x, y) => x >= 5 && x <= 34 && y >= 8 && y <= 12),
    );
    expect(result).toHaveLength(1);
    expect(result[0].points).toHaveLength(2);
    expect(result[0].points[0].y).toBe(9.5);
    expect(result[0].points[1].y).toBe(9.5);
    expect(result[0].points[0]).not.toEqual(result[0].points[1]);
});
test('one-pixel cross preserves four branches sharing one junction without duplicate edges', () => {
    const result = run(
        draw(
            21,
            21,
            (x, y) =>
                (x === 10 && y >= 3 && y <= 17) ||
                (y === 10 && x >= 3 && x <= 17),
        ),
    );
    expect(result).toHaveLength(4);
    const junction = { x: 10.5, y: 10.5 };
    expect(
        result.every((path) =>
            path.points.some((p) => p.x === junction.x && p.y === junction.y),
        ),
    ).toBe(true);
    expect(result.map((path) => path.points.length)).toEqual([2, 2, 2, 2]);
    const length = result.reduce(
        (n, path) =>
            n +
            Math.hypot(
                path.points[1].x - path.points[0].x,
                path.points[1].y - path.points[0].y,
            ),
        0,
    );
    expect(length).toBe(28);
});
test('a closed line-art loop remains a single closed path', () => {
    const result = run(
        draw(
            20,
            20,
            (x, y) =>
                ((x === 4 || x === 15) && y >= 4 && y <= 15) ||
                ((y === 4 || y === 15) && x >= 4 && x <= 15),
        ),
    );
    expect(result).toHaveLength(1);
    const points = result[0].points;
    expect(points[points.length - 1]).toEqual(points[0]);
    expect(points).toHaveLength(5);
});
test('diagonal lines and artwork touching the image boundary stay connected', () => {
    const result = run(draw(12, 12, (x, y) => x === y));
    expect(result).toHaveLength(1);
    expect(result[0].points).toHaveLength(2);
    expect(new Set(result[0].points.map((p) => p.x))).toEqual(
        new Set([0.5, 11.5]),
    );
});
test('speckle filtering removes small components before thinning without joining separate strokes', () => {
    const result = run(
        draw(
            40,
            20,
            (x, y) =>
                (y === 5 && x >= 4 && x <= 16) ||
                (y === 15 && x >= 20 && x <= 30) ||
                (y === 0 && x < 2),
        ),
        { turdsize: 2 },
    );
    expect(result).toHaveLength(2);
    expect(result.every((path) => path.points.length === 2)).toBe(true);
});
test('rotation and physical placement apply to open centre-line endpoints', () => {
    const image = () => draw(20, 10, (x, y) => y === 5 && x >= 2 && x <= 17);
    const make = (rotation: number) =>
        tracePixels({
            image: image(),
            placement: { x: 100, y: 200, width: 40, height: 20, rotation },
            options,
        });
    const plain = make(0),
        rotated = make(90);
    plain[0].points.forEach((p, i) => {
        expect(rotated[0].points[i].x).toBeCloseTo(120 - (p.y - 210), 8);
        expect(rotated[0].points[i].y).toBeCloseTo(210 + (p.x - 120), 8);
    });
});
test('outline remains the default and invalid modes fail', () => {
    const image = () =>
        draw(20, 10, (x, y) => x >= 3 && x <= 16 && y >= 3 && y <= 6);
    const request = {
        image: image(),
        placement: { x: 0, y: 0, width: 20, height: 10 },
        options: { ...options, traceMode: 'outline' as const },
    };
    const outline = tracePixels(request)[0].points;
    expect(outline[outline.length - 1]).toEqual(outline[0]);
    expect(() => run(image(), { traceMode: 'unknown' })).toThrow(/settings/);
});
