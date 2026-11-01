import { parseSvg } from './svg.js';
import { svgLengthValue } from './svg-lengths.js';
const read = (
    attributes: string,
    root = 'width="100" height="80" viewBox="0 0 100 80"',
) =>
    parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" ${root}><rect x="10" y="5" width="20" height="10" ${attributes}/></svg>`,
    )[0];
const has = (points: { x: number; y: number }[], x: number, y: number) =>
    points.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
test.each([
    ['rx="2"', 2, 2],
    ['ry="3"', 3, 3],
    ['rx="-2" ry="3"', 3, 3],
    ['rx="99" ry="99"', 10, 5],
    ['rx="2" ry="4"', 2, 4],
    ['rx="10%"', 10, 5],
    ['rx="2mm"', (96 / 25.4) * 2, 5],
])(
    'rounded rect %s preserves the effective elliptical tangencies',
    (attributes, rx, ry) => {
        const points = read(attributes as string).vertices;
        rx = Number(rx);
        ry = Number(ry);
        for (const [x, y] of [
            [10 + rx, 5],
            [30 - rx, 5],
            [30, 5 + ry],
            [30, 15 - ry],
            [30 - rx, 15],
            [10 + rx, 15],
            [10, 15 - ry],
            [10, 5 + ry],
        ])
            expect(has(points, x, y)).toBe(true);
        expect(has(points, 10, 5)).toBe(false);
    },
);
test.each(['', 'rx="0" ry="3"', 'rx="3" ry="0"', 'rx="-2"', 'rx="0"'])(
    'square rect %s retains its exact four corners',
    (attrs) => {
        const points = read(attrs).vertices;
        expect(points.map((p: { x: number; y: number }) => [p.x, p.y])).toEqual(
            [
                [10, 5],
                [30, 5],
                [30, 15],
                [10, 15],
            ],
        );
    },
);
test('rectangles, lines, circles and ellipses resolve geometry percentages in the SVG viewport', () => {
    const entities = parseSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10%" y="10%" width="20%" height="20%" rx="2%"/><line x1="10%" y1="10%" x2="50%" y2="50%"/><circle cx="50%" cy="50%" r="10%"/><ellipse cx="50%" cy="50%" rx="10%" ry="10%"/></svg>',
    );
    expect(has(entities[0].vertices, 24, 10)).toBe(true);
    expect(entities[1]).toMatchObject({ x1: 20, y1: 10, x2: 100, y2: 50 });
    const radius = (Math.hypot(200, 100) / Math.SQRT2) * 0.1;
    expect(entities[2].vertices[0]).toMatchObject({ x: 100 + radius, y: 50 });
    expect(entities[3].vertices[0]).toMatchObject({ x: 120, y: 50 });
});
test('absolute lengths use CSS pixel conversion and unsupported geometry expressions fail visibly', () => {
    expect(svgLengthValue('1in')).toBe(96);
    expect(svgLengthValue('25.4mm')).toBe(96);
    expect(svgLengthValue('72pt')).toBe(96);
    expect(svgLengthValue('6pc')).toBe(96);
    expect(svgLengthValue('101.6q')).toBe(96);
    expect(() => svgLengthValue('2em')).toThrow(/unit/);
    expect(() => svgLengthValue('calc(2px + 1px)')).toThrow(/expression/);
    expect(() => svgLengthValue('1e308in')).toThrow(/length/);
    expect(() => svgLengthValue('1constructor')).toThrow(/unit/);
});

test('overflowing rectangle coordinates are rejected before entering the drawing', () => {
    expect(() =>
        parseSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect x="1e308" y="0" width="1e308" height="10"/></svg>',
        ),
    ).toThrow(/coordinates/);
});

test('overflowing transformed line coordinates are rejected', () => {
    expect(() =>
        parseSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><line x1="1e308" y1="0" x2="0" y2="10" transform="scale(2)"/></svg>',
        ),
    ).toThrow(/coordinates/);
});
