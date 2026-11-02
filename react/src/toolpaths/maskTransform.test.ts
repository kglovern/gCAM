import {
    transformImageMask,
    IDENTITY_MASK_TRANSFORM as identity,
} from './maskTransform';
const rect = (l: number, b: number, r: number, t: number) => [
    { x: l, y: b },
    { x: r, y: b },
    { x: r, y: t },
    { x: l, y: t },
    { x: l, y: b },
];
const mask = [rect(0.25, 0.25, 0.75, 0.75), rect(0.4, 0.4, 0.6, 0.6)];
test('identity preserves closed outlines and holes without mutating input', () => {
    const before = JSON.stringify(mask),
        result = transformImageMask(mask, { w: 100, h: 50 }, identity);
    expect(result).toEqual(mask);
    expect(result).not.toBe(mask);
    expect(JSON.stringify(mask)).toBe(before);
});
test('translation uses physical distances and preserves relative holes', () => {
    const result = transformImageMask(
        mask,
        { w: 100, h: 50 },
        { ...identity, x: 10, y: -5 },
    );
    expect(result[0][0].x).toBeCloseTo(0.35);
    expect(result[0][0].y).toBeCloseTo(0.15);
    expect(result[1][0].x).toBeCloseTo(0.5);
    expect(result[1][0].y).toBeCloseTo(0.3);
});
test('rotation uses physical image dimensions rather than distorted normalized axes', () => {
    const result = transformImageMask(
        mask,
        { w: 100, h: 50 },
        { ...identity, angle: 90 },
    );
    expect(result[0][0].x).toBeCloseTo(0.625);
    expect(result[0][0].y).toBeCloseTo(0);
    expect(result[0][4]).toEqual(result[0][0]);
});
test('nonuniform scale is about the whole mask centre, including holes', () => {
    const result = transformImageMask(
        mask,
        { w: 100, h: 50 },
        { ...identity, scaleX: 0.5, scaleY: 2 },
    );
    expect(result[0][0]).toEqual({ x: 0.375, y: 0 });
    expect(result[1][0].x).toBeCloseTo(0.45);
    expect(result[1][0].y).toBeCloseTo(0.3);
});
test('mask can extend outside the image while remaining closed', () => {
    const result = transformImageMask(
        mask,
        { w: 100, h: 50 },
        { ...identity, x: 100 },
    );
    expect(result[0][0].x).toEqual(1.25);
    expect(result[0][4]).toEqual(result[0][0]);
});
test.each([
    { scaleX: 0 },
    { scaleY: 101 },
    { angle: 361 },
    { x: NaN },
    { y: Infinity },
])('invalid transform is rejected %p', (patch) =>
    expect(() =>
        transformImageMask(mask, { w: 100, h: 50 }, { ...identity, ...patch }),
    ).toThrow(),
);
test('empty, open and over-detailed masks and invalid image dimensions are rejected', () => {
    expect(() => transformImageMask([], { w: 100, h: 50 }, identity)).toThrow();
    expect(() =>
        transformImageMask(
            [
                [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                    { x: 0, y: 1 },
                ],
            ],
            { w: 100, h: 50 },
            identity,
        ),
    ).toThrow();
    expect(() => transformImageMask(mask, { w: 0, h: 50 }, identity)).toThrow();
    expect(() =>
        transformImageMask(
            [Array.from({ length: 20001 }, () => ({ x: 0, y: 0 }))],
            { w: 100, h: 50 },
            identity,
        ),
    ).toThrow();
});
