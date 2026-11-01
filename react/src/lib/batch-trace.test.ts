import { batchSvgNames, tracedSvg } from './batch-trace';
const ring = (min: number, max: number) => ({
    points: [
        { x: min, y: min },
        { x: max, y: min },
        { x: max, y: max },
        { x: min, y: max },
        { x: min, y: min },
    ],
});
test('batch names are collision-safe across extensions, case and invalid file characters', () => {
    expect(
        batchSvgNames([
            'Art.png',
            'art.jpg',
            'art (2).png',
            'a/b.png',
            'a:b.png',
            '.png',
        ]),
    ).toEqual([
        'Art.svg',
        'art (2).svg',
        'art (2) (2).svg',
        'a-b.svg',
        'a-b (2).svg',
        'trace.svg',
    ]);
});
test('outline SVG preserves physical dimensions, image orientation and holes in one even-odd path', () => {
    const text = tracedSvg([ring(1, 9), ring(3, 7)], 10, 20, 'mm', 'outline');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.getAttribute('width')).toBe('10mm');
    expect(doc.documentElement.getAttribute('height')).toBe('20mm');
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 10 20');
    expect(doc.querySelector('path')?.getAttribute('fill-rule')).toBe(
        'evenodd',
    );
    expect(doc.querySelector('path')?.getAttribute('d')).toContain(
        'M1 19 L9 19',
    );
    expect(
        doc.querySelector('path')?.getAttribute('d')?.match(/ Z/g),
    ).toHaveLength(2);
});
test('center-line SVG retains open strokes and closed loops with pixel sizing fallback', () => {
    const text = tracedSvg(
        [
            {
                points: [
                    { x: 1, y: 2 },
                    { x: 4, y: 2 },
                ],
            },
            ring(5, 9),
        ],
        10,
        10,
        'px',
        'centerline',
    );
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(doc.documentElement.getAttribute('width')).toBe('10px');
    const path = doc.querySelector('path')!;
    expect(path.getAttribute('fill')).toBe('none');
    expect(path.getAttribute('stroke')).toBe('black');
    expect(path.getAttribute('d')).toMatch(/^M1 8 L4 8 M/);
    expect(path.getAttribute('d')?.match(/ Z/g)).toHaveLength(1);
});
test('invalid dimensions and coordinates fail before SVG serialization', () => {
    expect(() => tracedSvg([ring(1, 2)], NaN, 10, 'px', 'outline')).toThrow(
        /dimensions/,
    );
    expect(() =>
        tracedSvg(
            [
                {
                    points: [
                        { x: NaN, y: 0 },
                        { x: 1, y: 1 },
                    ],
                },
            ],
            10,
            10,
            'px',
            'outline',
        ),
    ).toThrow(/geometry/);
});
