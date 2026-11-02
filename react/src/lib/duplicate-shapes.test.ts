import { repairPaths } from './path-repair';
import type { ViewLoop } from '../canvas/types';
const path = (id: string, pairs: number[][]): ViewLoop => ({
    id,
    points: pairs.map(([x, y]) => ({ x, y })),
});
const run = (shapes: ViewLoop[], acrossLayers = false) =>
    repairPaths({
        shapes,
        mode: 'duplicates',
        closure: 'line',
        tolerance: 0.05,
        acrossLayers,
    });
const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
];
test('closed paths match cyclic starts, reversal and collinear subdivisions without mutating the keeper', () => {
    const a = {
        ...path('first', square),
        sourceType: 'rectangle',
        groupId: undefined,
    };
    const b = path('reverse', [
        [10, 10],
        [10, 5],
        [10, 0],
        [0, 0],
        [0, 10],
        [10, 10],
    ]);
    const c = path('seam', [
        [5, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
        [5, 0],
    ]);
    const before = JSON.stringify([a, b, c]),
        r = run([a, b, c]);
    expect(r.duplicates).toBe(2);
    expect(r.changedIds).toEqual(['reverse', 'seam']);
    expect(r.duplicateKeepIds).toEqual(['first']);
    expect(r.shapes).toEqual([a]);
    expect(r.shapes[0]).toBe(a);
    expect(JSON.stringify([a, b, c])).toBe(before);
});
test('open paths match either direction and extra straight samples, but not closed or backtracking paths', () => {
    const a = path('a', [
            [0, 0],
            [10, 0],
            [10, 10],
        ]),
        b = path('b', [
            [10, 10],
            [10, 5],
            [10, 0],
            [5, 0],
            [0, 0],
        ]);
    expect(run([a, b]).changedIds).toEqual(['b']);
    expect(
        run([
            a,
            path('backtrack', [
                [0, 0],
                [10, 0],
                [5, 0],
                [10, 0],
                [10, 10],
            ]),
        ]).duplicates,
    ).toBe(0);
    expect(
        run([
            a,
            path('closed', [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
            ]),
        ]).duplicates,
    ).toBe(0);
});
test('identical bounds do not imply identical shape or winding multiplicity', () => {
    const a = path('a', square),
        triangle = path('triangle', [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 0],
        ]),
        twice = path('twice', [...square, ...square.slice(1)]);
    expect(run([a, triangle, twice]).duplicates).toBe(0);
});
test('images, grouped shapes and degenerate points are preserved; cross-layer comparison is explicit', () => {
    const a = { ...path('a', square), layerId: 'a' },
        b = { ...path('b', square), layerId: 'b' },
        group = { ...path('group', square), groupId: 'g' },
        image = { ...path('image', square), bitmapId: 'img' },
        point = path('point', [
            [0, 0],
            [0, 0],
        ]);
    expect(run([a, b, group, image, point])).toMatchObject({
        duplicates: 0,
        scanned: 2,
        skipped: 3,
    });
    expect(run([a, b, group, image, point], true)).toMatchObject({
        duplicates: 1,
        changedIds: ['b'],
        scanned: 2,
        skipped: 3,
    });
});
test('geometry matches on a one-nanometre grid without moving source coordinates', () => {
    const a = path('a', [
            [0, 0],
            [10, 0],
        ]),
        near = path('near', [
            [0.0000001, 0],
            [10.0000001, 0],
        ]),
        different = path('different', [
            [0.000002, 0],
            [10.000002, 0],
        ]);
    expect(run([a, near, different]).changedIds).toEqual(['near']);
    expect(a.points[0].x).toBe(0);
});
test('large-coordinate diagonal subdivisions use exact integer collinearity', () => {
    const a = path('a', [
            [-1000000, -1000000],
            [1000000, 1000000],
        ]),
        b = path('b', [
            [-1000000, -1000000],
            [0, 0],
            [1000000, 1000000],
        ]);
    expect(run([a, b]).duplicates).toBe(1);
    expect(
        run([
            a,
            path('kink', [
                [-1000000, -1000000],
                [0, 0.000001],
                [1000000, 1000000],
            ]),
        ]).duplicates,
    ).toBe(0);
});
test('all starts and directions of a repeated-vertex ring match', () => {
    const ring = [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
        [-5, 0],
        [-5, -5],
        [0, -5],
    ];
    const variants: ViewLoop[] = [];
    for (let start = 0; start < ring.length; start++)
        for (const reverse of [false, true]) {
            const p = [...ring.slice(start), ...ring.slice(0, start)];
            if (reverse) p.reverse();
            variants.push(path(String(variants.length), [...p, p[0]]));
        }
    expect(run(variants).duplicates).toBe(variants.length - 1);
});
test('deterministic random rings match all rotations and directions and reject a moved vertex', () => {
    let seed = 12345;
    const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % 1000;
    };
    for (let trial = 0; trial < 40; trial++) {
        const ring = Array.from({ length: 10 }, () => [rand(), rand()]);
        const a = path('a', [...ring, ring[0]]);
        for (let j = 0; j < 10; j++) {
            const rotated = [...ring.slice(j), ...ring.slice(0, j)].reverse();
            const b = path('b', [...rotated, rotated[0]]);
            expect(run([a, b]).duplicates).toBe(1);
        }
        const moved = ring.map((p) => [...p]);
        moved[3][0] += 0.01;
        expect(run([a, path('moved', [...moved, moved[0]])]).duplicates).toBe(
            0,
        );
    }
});
test('invalid coordinates and oversize inputs fail before matching', () => {
    expect(() =>
        run([
            path('bad', [
                [NaN, 0],
                [1, 1],
            ]),
        ]),
    ).toThrow();
    expect(() =>
        run(
            Array.from({ length: 100001 }, () =>
                path('a', [
                    [0, 0],
                    [1, 0],
                ]),
            ),
        ),
    ).toThrow();
});
