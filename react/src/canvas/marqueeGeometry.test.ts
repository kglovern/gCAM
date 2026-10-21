import { matchesMarquee } from './marqueeGeometry';
const min = { x: 0, y: 0 },
    max = { x: 10, y: 10 };
test('window requires the whole vector while crossing includes partial vectors', () => {
    const points = [
        { x: -5, y: 5 },
        { x: 5, y: 5 },
    ];
    expect(matchesMarquee(points, min, max, false)).toBe(false);
    expect(matchesMarquee(points, min, max, true)).toBe(true);
    expect(matchesMarquee([{ x: 0, y: 0 }, max], min, max, false)).toBe(true);
});
test('crossing catches segments with both endpoints outside including tangencies', () => {
    expect(
        matchesMarquee(
            [
                { x: -5, y: 5 },
                { x: 15, y: 5 },
            ],
            min,
            max,
            true,
        ),
    ).toBe(true);
    expect(
        matchesMarquee(
            [
                { x: -5, y: 5 },
                { x: 5, y: -5 },
            ],
            min,
            max,
            true,
        ),
    ).toBe(true);
});
test('bounding box overlap alone does not select a vector or enclosed empty space', () => {
    expect(
        matchesMarquee(
            [
                { x: -5, y: 2 },
                { x: 2, y: -5 },
            ],
            min,
            max,
            true,
        ),
    ).toBe(false);
    expect(
        matchesMarquee(
            [
                { x: -1, y: -1 },
                { x: 11, y: -1 },
                { x: 11, y: 11 },
                { x: -1, y: 11 },
                { x: -1, y: -1 },
            ],
            min,
            max,
            true,
        ),
    ).toBe(false);
});
