import {
    flattenBezier,
    flattenEllipse,
    flattenSvgArc,
} from './curveFlattening.js';
import { applyMatrixToPoint, createMatrix } from './matrix.js';
type Point = { x: number; y: number };
const distance = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x,
        dy = b.y - a.y;
    const t = Math.max(
        0,
        Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
    );
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const error = (p: Point, poly: Point[]) =>
    poly
        .slice(1)
        .reduce(
            (min, b, i) => Math.min(min, distance(p, poly[i], b)),
            Infinity,
        );
const evaluate = (controls: Point[], t: number): Point => {
    let level = controls;
    while (level.length > 1)
        level = level.slice(1).map((p, i) => ({
            x: (1 - t) * level[i].x + t * p.x,
            y: (1 - t) * level[i].y + t * p.y,
        }));
    return level[0];
};
test.each(
    [
        [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
            { x: -100, y: 100 },
            { x: 0, y: 0 },
        ],
        [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: -100, y: 0 },
            { x: 0, y: 0 },
        ],
        [
            { x: 0, y: 0 },
            { x: 1, y: 10 },
            { x: 2, y: 0 },
        ],
    ].map((controls) => ({ controls })),
)(
    'Bezier control-hull subdivision bounds dense source samples',
    ({ controls }) => {
        const tol = 0.05,
            poly = flattenBezier(controls, tol);
        expect(poly[0]).toEqual(controls[0]);
        expect(poly[poly.length - 1]).toEqual(controls[controls.length - 1]);
        for (let i = 0; i <= 2000; i++)
            expect(error(evaluate(controls, i / 2000), poly)).toBeLessThan(tol);
    },
);
test('nonuniformly transformed Beziers use the transformed error, not source step size', () => {
    const matrix = createMatrix(100, 30, 10, 0.2, 20, 15);
    const controls = [
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 0 },
    ].map((p) => applyMatrixToPoint(p, matrix));
    const poly = flattenBezier(controls, 0.05);
    for (let i = 0; i <= 2000; i++)
        expect(error(evaluate(controls, i / 2000), poly)).toBeLessThan(0.05);
});
test.each([1, 100, 1000])(
    'elliptical chord bound holds at scale %s',
    (scale) => {
        const center = { x: 0, y: 0 },
            u = { x: 3 * scale, y: scale },
            v = { x: 0.1 * scale, y: 2 * scale };
        const poly = flattenEllipse(center, u, v, 0, 2 * Math.PI, 0.05);
        for (let i = 0; i <= 3000; i++) {
            const a = (i / 3000) * 2 * Math.PI;
            expect(
                error(
                    {
                        x: u.x * Math.cos(a) + v.x * Math.sin(a),
                        y: u.y * Math.cos(a) + v.y * Math.sin(a),
                    },
                    poly,
                ),
            ).toBeLessThan(0.05);
        }
    },
);
test.each([0, 1])(
    'SVG semicircle sweep %s preserves endpoints and bounds its radius',
    (sweep) => {
        const poly = flattenSvgArc(
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            [1, 1, 0, 0, sweep],
            createMatrix(),
            0.01,
        );
        expect(poly[0]).toEqual({ x: 0, y: 0 });
        expect(poly[poly.length - 1]).toEqual({ x: 2, y: 0 });
        for (let i = 0; i <= 1000; i++) {
            const a = Math.PI + (i / 1000) * Math.PI * (sweep ? 1 : -1);
            expect(
                error({ x: 1 + Math.cos(a), y: Math.sin(a) }, poly),
            ).toBeLessThan(0.01);
        }
    },
);
test('SVG radii correction, zero radii, point budget and numeric precision are explicit', () => {
    const corrected = flattenSvgArc(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        [1, 1, 0, 0, 1],
        createMatrix(),
        0.01,
    );
    expect(
        corrected.every((p) => Math.abs(Math.hypot(p.x - 5, p.y) - 5) < 1e-8),
    ).toBe(true);
    expect(
        flattenSvgArc(
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            [0, 1, 0, 0, 1],
            createMatrix(),
        ),
    ).toHaveLength(2);
    expect(() =>
        flattenEllipse(
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 0, y: 100 },
            0,
            Math.PI,
            0.001,
            3,
        ),
    ).toThrow(/detailed/);
    expect(() =>
        flattenBezier(
            [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 0 },
            ],
            0.001,
            3,
        ),
    ).toThrow(/detailed/);
    expect(() =>
        flattenEllipse(
            { x: 1e16, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            0,
            Math.PI,
            0.05,
        ),
    ).toThrow(/precision/);
});

test('radii correction does not amplify rounding into a false off-centre arc', () => {
    for (let a = 0.1; a < 6; a += 0.37) {
        const radius = 100000,
            end = { x: 2 * radius * Math.cos(a), y: 2 * radius * Math.sin(a) };
        const poly = flattenSvgArc(
            { x: 0, y: 0 },
            end,
            [1, 1, 0, 0, 1],
            createMatrix(),
            1,
        );
        expect(
            poly.every(
                (p) =>
                    Math.abs(
                        Math.hypot(p.x - end.x / 2, p.y - end.y / 2) - radius,
                    ) < 1e-8,
            ),
        ).toBe(true);
    }
    expect(() =>
        flattenSvgArc(
            { x: 0, y: 0 },
            { x: 2e9, y: 0 },
            [1e9, 1e9, 0, 0, 1],
            createMatrix(),
            0.05,
        ),
    ).toThrow(/precision/);
});
