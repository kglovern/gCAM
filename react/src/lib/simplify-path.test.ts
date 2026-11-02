import { repairPaths } from './path-repair';
import type { ViewLoop } from '../canvas/types';

const shape = (points: { x: number; y: number }[], id = 'curve'): ViewLoop => ({
    id,
    points,
});
const fit = (shapes: ViewLoop[], tolerance = 0.05) =>
    repairPaths({ shapes, mode: 'simplify', tolerance, closure: 'line' });
const distance = (p: { x: number; y: number }, line: ViewLoop['points']) =>
    Math.min(
        ...line.slice(1).map((b, i) => {
            const a = line[i],
                dx = b.x - a.x,
                dy = b.y - a.y,
                n = dx * dx + dy * dy;
            const t = n
                ? Math.max(
                      0,
                      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n),
                  )
                : 0;
            return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
        }),
    );
test('dense open curve keeps endpoints, stays within tolerance in both directions and leaves input intact', () => {
    const points = Array.from({ length: 501 }, (_, i) => ({
        x: i / 5,
        y: 10 * Math.sin(i / 50),
    }));
    const source = shape(points),
        before = JSON.stringify(source);
    const result = fit([source]);
    const output = result.shapes[0].points;
    expect(output.length).toBeLessThan(100);
    expect(output[0]).toEqual(points[0]);
    expect(output[output.length - 1]).toEqual(points[points.length - 1]);
    for (const [a, b] of [
        [points, output],
        [output, points],
    ])
        for (let i = 1; i < a.length; i++)
            for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
                const p = {
                    x: a[i - 1].x + fraction * (a[i].x - a[i - 1].x),
                    y: a[i - 1].y + fraction * (a[i].y - a[i - 1].y),
                };
                expect(distance(p, b)).toBeLessThanOrEqual(0.050000001);
            }
    expect(JSON.stringify(source)).toBe(before);
    expect(result.pointsBefore).toBe(501);
    expect(result.pointsAfter).toBe(output.length);
});
test.each([1, -1])(
    'closed curves retain closure, seam, winding and stable identity (%i)',
    (direction) => {
        const points = Array.from({ length: 1001 }, (_, i) => {
            const angle =
                direction * (i === 1000 ? 0 : (i / 1000) * 2 * Math.PI);
            return {
                x: 100 + 30 * Math.cos(angle),
                y: 100 + 30 * Math.sin(angle),
            };
        });
        const source = {
            ...shape(points),
            groupId: 'g',
            layerId: 'l',
            layerColor: '#f00',
            primitive: { type: 'circle' },
        } as ViewLoop;
        const output = fit([source]).shapes[0];
        expect(output.id).toBe('curve');
        expect(output.groupId).toBe('g');
        expect(output.layerId).toBe('l');
        expect(output.layerColor).toBe('#f00');
        expect(output).not.toHaveProperty('primitive');
        expect(output.points.length).toBeGreaterThanOrEqual(4);
        expect(output.points.length).toBeLessThan(150);
        expect(output.points[0]).toEqual(points[0]);
        expect(output.points[output.points.length - 1]).toEqual(points[1000]);
        const area = output.points
            .slice(1)
            .reduce(
                (n, p, i) =>
                    n + output.points[i].x * p.y - p.x * output.points[i].y,
                0,
            );
        expect(Math.sign(area)).toBe(direction);
    },
);
test('keeps collinear reversals, corners and zero-area closed paths even at a large tolerance', () => {
    const backtrack = shape([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 20, y: 0 },
    ]);
    expect(fit([backtrack], 100).shapes[0]).toEqual(backtrack);
    const closed = shape([...backtrack.points, { x: 0, y: 0 }]);
    expect(fit([closed], 100).shapes[0]).toEqual(closed);
    const corner = shape([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
    ]);
    expect(fit([corner]).shapes[0]).toEqual(corner);
});
test('straight dense paths reduce to endpoints; bitmap outlines and unrelated two-point paths stay intact', () => {
    const dense = shape(
            Array.from({ length: 1000 }, (_, i) => ({ x: i, y: 1 })),
        ),
        bitmap = { ...dense, id: 'image', bitmapId: 'bitmap' },
        line = shape(
            [
                { x: 1, y: 2 },
                { x: 4, y: 8 },
            ],
            'line',
        );
    const result = fit([dense, bitmap, line]);
    expect(result.shapes[0].points).toEqual([
        dense.points[0],
        dense.points[999],
    ]);
    expect(result.shapes[1]).toBe(bitmap);
    expect(result.shapes[2]).toBe(line);
    expect(result.changedIds).toEqual(['curve']);
});
test.each([NaN, Infinity, -1, 0, 1001])(
    'rejects invalid tolerance %s',
    (tolerance) => {
        expect(() => fit([], tolerance)).toThrow(
            'Invalid path repair settings',
        );
    },
);
test('rejects malformed and oversized source geometry before fitting', () => {
    expect(() => fit([shape([{ x: NaN, y: 0 }])])).toThrow(
        'invalid coordinates',
    );
    expect(() => fit([shape(Array(1000001).fill({ x: 0, y: 0 }))])).toThrow(
        'too complex',
    );
});
test('bounds worst-case fitting work instead of blocking indefinitely', () => {
    expect(() =>
        fit([shape(Array.from({ length: 7000 }, () => ({ x: 0, y: 0 })))]),
    ).toThrow('Path fitting is too complex');
});
