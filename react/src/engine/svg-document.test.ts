import { parseSvg } from './svg.js';
import { svgDocumentSpace } from './svg-document.js';
import {
    importVectorFile,
    scaleImportResult,
    svgUnitScaleToMm,
} from '../lib/import';
const text = (
    attrs: string,
    shape = '<line x1="10" y1="20" x2="30" y2="30"/>',
) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${shape}</svg>`;
const read = (attrs: string, shape?: string) =>
    parseSvg(text(attrs, shape), { coordinateSpace: 'cam' })[0];
const expectLine = (p: any, expected: number[]) =>
    [p.x1, p.y1, p.x2, p.y2].forEach((v, i) =>
        expect(v).toBeCloseTo(expected[i], 8),
    );
test('CAM maps the document bottom-left to the origin and source top to positive Y', () => {
    expectLine(
        read('width="100mm" height="50mm" viewBox="10 20 20 10"'),
        [0, 10, 20, 0],
    );
    expectLine(parseSvg(text('viewBox="10 20 20 10"'))[0], [10, 20, 30, 30]);
});
test.each([
    ['', [0, 15, 20, 5]],
    ['preserveAspectRatio="none"', [0, 20, 20, 0]],
    ['preserveAspectRatio="xMinYMin meet"', [0, 20, 20, 10]],
    ['preserveAspectRatio="xMaxYMax meet"', [0, 10, 20, 0]],
    ['preserveAspectRatio="xMidYMid slice"', [-10, 20, 30, 0]],
])(
    'maps root viewport alignment %s before CAM reflection',
    (aspect, expected) => {
        expectLine(
            read(
                `width="100mm" height="100mm" viewBox="10 20 20 10" ${aspect}`,
            ),
            expected as number[],
        );
    },
);
test('height-only sizing and dimensionless viewBox sizing preserve aspect ratio', () => {
    expectLine(read('height="100mm" viewBox="10 20 20 10"'), [0, 10, 20, 0]);
    expectLine(read('viewBox="10 20 20 10"'), [0, 10, 20, 0]);
    expect(
        svgUnitScaleToMm(text('height="100mm" viewBox="10 20 20 10"')).scale,
    ).toBeCloseTo(10, 12);
});
test('no-viewBox SVG uses CSS coordinates with an upward CAM Y axis', () => {
    expectLine(read('width="200" height="100"'), [10, 80, 30, 70]);
});
test.each([
    'width="0" height="100"',
    'viewBox="0 0 0 10"',
    'height="0" viewBox="0 0 10 10"',
])('zero-sized document produces no geometry %s', (attrs) =>
    expect(parseSvg(text(attrs), { coordinateSpace: 'cam' })).toEqual([]),
);
test('physical unit metadata accepts scientific notation and quarter-millimetres', () => {
    expect(
        svgUnitScaleToMm(text('width="400q" viewBox="0 0 100 100"')).scale,
    ).toBeCloseTo(1, 12);
    expect(
        svgUnitScaleToMm(text('width="2.54e1mm" viewBox="0 0 96 96"')).scale,
    ).toBeCloseTo(25.4 / 96, 12);
});
test('imported asymmetric F keeps its top bar above its middle bar in physical CAM coordinates', async () => {
    const file = new File(
        [
            text(
                'width="100mm" height="80mm" viewBox="0 0 100 80"',
                '<path d="M10 10H40V20H20V30H35V40H20V60H10Z"/>',
            ),
        ],
        'letter.svg',
    );
    const result = await importVectorFile(file),
        physical = scaleImportResult(result, result.unitScaleToMm!);
    const points = physical.loops[0].points;
    for (const [x, y] of [
        [10, 70],
        [40, 70],
        [40, 60],
        [35, 50],
        [35, 40],
        [10, 20],
    ])
        expect(points.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-8)).toBe(
            true,
        );
    expect(physical.bounds).toMatchObject({
        minX: 10,
        minY: 20,
        maxX: 40,
        maxY: 70,
    });
});
test('root viewport arithmetic rejects values too large or too small to map safely', () => {
    const doc = new DOMParser().parseFromString(
        text('width="1e308" height="1e308" viewBox="0 0 1e-308 1"'),
        'image/svg+xml',
    );
    expect(() => svgDocumentSpace(doc.documentElement)).toThrow(/Invalid SVG/);
    expect(() => parseSvg(text(''), { coordinateSpace: 'bad' })).toThrow(
        'coordinate space',
    );
});

test.each([
    ['', [100, 100, 100, 0]],
    ['transform-origin="0 0"', [0, 100, 0, 0]],
    ['transform-origin="25% 75%"', [100, 50, 100, -50]],
])('root transforms use the SVG viewport origin %s', (origin, expected) => {
    expectLine(
        read(
            `width="100mm" height="100mm" viewBox="0 0 100 100" transform="rotate(90)" ${origin}`,
            '<line x2="100"/>',
        ),
        expected as number[],
    );
});
test('nonuniform root physical scaling preserves the curve-error target', async () => {
    const source = text(
        'width="100mm" height="1000mm" viewBox="0 0 100 100" preserveAspectRatio="none"',
        '<circle cx="50" cy="50" r="5"/>',
    );
    const result = await importVectorFile(new File([source], 'ellipse.svg'));
    const points = scaleImportResult(result, result.unitScaleToMm!).loops[0]
        .points;
    let maximum = 0;
    for (let i = 0; i <= 4000; i++) {
        const angle = (2 * Math.PI * i) / 4000,
            x = 50 + 5 * Math.cos(angle),
            y = 500 - 50 * Math.sin(angle);
        let closest = Infinity;
        for (let j = 1; j < points.length; j++) {
            const a = points[j - 1],
                b = points[j],
                dx = b.x - a.x,
                dy = b.y - a.y;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((x - a.x) * dx + (y - a.y) * dy) /
                        (dx * dx + dy * dy || 1),
                ),
            );
            closest = Math.min(
                closest,
                Math.hypot(x - a.x - t * dx, y - a.y - t * dy),
            );
        }
        maximum = Math.max(maximum, closest);
    }
    expect(maximum).toBeLessThan(0.05);
});
