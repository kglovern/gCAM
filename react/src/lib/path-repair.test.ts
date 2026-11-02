import {
    isOpenShape,
    repairPaths,
    type PathRepairRequest,
} from './path-repair';
import type { ViewLoop } from '../canvas/types';
const path = (id: string, xy: number[][]): ViewLoop => ({
    id,
    points: xy.map(([x, y]) => ({ x, y })),
});
const request = (shapes: ViewLoop[], patch: Partial<PathRepairRequest> = {}) =>
    repairPaths({
        shapes,
        mode: 'join',
        tolerance: 0.05,
        closure: 'line',
        ...patch,
    });
test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
])(
    'joins either orientation with one midpoint, preserving source input %p %p',
    (reverseA, reverseB) => {
        const a = path('a', [
                [0, 0],
                [10, 0],
            ]),
            b = path('b', [
                [10.02, 0],
                [20, 0],
            ]);
        if (reverseA) a.points.reverse();
        if (reverseB) b.points.reverse();
        const before = JSON.stringify([a, b]),
            r = request([a, b]);
        expect(r.joined).toBe(1);
        expect(r.remaining).toBe(1);
        expect(r.shapes).toHaveLength(1);
        expect(r.shapes[0].id).toBe('a');
        expect(r.shapes[0].points).toHaveLength(3);
        expect(r.shapes[0].points[1].x).toBeCloseTo(10.01);
        expect(JSON.stringify([a, b])).toBe(before);
    },
);
test('joins an entire fragmented cycle and retains layer/group while dropping stale analytic metadata', () => {
    const shapes = [
        path('a', [
            [0, 0],
            [10, 0],
        ]),
        path('b', [
            [10.02, 0],
            [10, 10],
        ]),
        path('c', [
            [10, 10.02],
            [0, 10],
        ]),
        path('d', [
            [0, 10.02],
            [0.02, 0],
        ]),
    ].map((p) => ({
        ...p,
        layerId: 'L',
        groupId: 'G',
        sourceType: 'circle',
        radius: 10,
    }));
    const r = request(shapes);
    expect(r).toMatchObject({ joined: 3, closed: 1, remaining: 0 });
    expect(r.shapes[0].points).toHaveLength(5);
    expect(r.shapes[0].points[0]).toEqual(r.shapes[0].points[4]);
    expect(r.shapes[0]).toMatchObject({ id: 'a', layerId: 'L', groupId: 'G' });
    expect(r.shapes[0].radius).toBeUndefined();
});
test('ambiguous junctions and unrelated crossing interiors are never guessed', () => {
    const junction = [
        path('a', [
            [0, 0],
            [10, 0],
        ]),
        path('b', [
            [0, 0],
            [0, 10],
        ]),
        path('c', [
            [0, 0],
            [-10, 0],
        ]),
    ];
    const r = request(junction);
    expect(r.changedIds).toEqual([]);
    expect(r.ambiguous).toBe(3);
    expect(r.shapes).toEqual(junction);
    expect(
        request([
            path('a', [
                [-10, 0],
                [10, 0],
            ]),
            path('b', [
                [0, -10],
                [0, 10],
            ]),
        ]).changedIds,
    ).toEqual([]);
});
test('layer and group boundaries prevent accidental joins', () => {
    const a = path('a', [
            [0, 0],
            [10, 0],
        ]),
        b = path('b', [
            [10, 0],
            [20, 0],
        ]);
    expect(
        request([
            { ...a, layerId: 'one' },
            { ...b, layerId: 'two' },
        ]).changedIds,
    ).toEqual([]);
    expect(request([{ ...a, groupId: 'one' }, b]).changedIds).toEqual([]);
});
test('close supports a connecting line or midpoint without changing other shapes', () => {
    const a = path('a', [
            [0, 0],
            [10, 0],
            [10, 10],
            [0.02, 0],
        ]),
        other = path('b', [
            [40, 0],
            [50, 0],
        ]);
    const line = request([a, other], { mode: 'close' }),
        move = request([a, other], { mode: 'close', closure: 'move' });
    expect(line.shapes[0].points).toHaveLength(5);
    expect(move.shapes[0].points).toHaveLength(4);
    expect(move.shapes[0].points[0].x).toBeCloseTo(0.01);
    expect(move.shapes[0].points[0]).toEqual(move.shapes[0].points[3]);
    expect(line.changedIds).toEqual(['a']);
    expect(line.shapes[1]).toBe(other);
    expect(request([a], { mode: 'close', tolerance: 0.01 }).changedIds).toEqual(
        [],
    );
});
test('near-closed paths close in join mode, but duplicate straight segments remain intact', () => {
    expect(
        request([
            path('a', [
                [0, 0],
                [10, 0],
                [10, 10],
                [0.02, 0],
            ]),
        ]).closed,
    ).toBe(1);
    expect(
        request([
            path('a', [
                [0, 0],
                [10, 0],
            ]),
            path('b', [
                [10, 0],
                [0, 0],
            ]),
        ]).changedIds,
    ).toEqual([]);
});
test('bitmap bounds and already closed paths stay untouched', () => {
    const closed = path('closed', [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 0],
        ]),
        bitmap = {
            ...path('image', [
                [30, 0],
                [40, 0],
            ]),
            bitmapId: 'image',
        };
    expect(isOpenShape(bitmap)).toBe(false);
    expect(request([closed, bitmap]).changedIds).toEqual([]);
});
test('endpoints across neighbouring hash cells join at the distance boundary', () => {
    const r = request([
        path('a', [
            [-20, 0],
            [-0.025, 0],
        ]),
        path('b', [
            [0.025, 0],
            [20, 0],
        ]),
    ]);
    expect(r.joined).toBe(1);
    expect(r.shapes[0].points[1]).toEqual({ x: 0, y: 0 });
});
test.each([NaN, 0, -1, 1001])(
    'invalid tolerance fails atomically %p',
    (tolerance) => {
        expect(() =>
            request(
                [
                    path('a', [
                        [0, 0],
                        [10, 0],
                    ]),
                ],
                { tolerance },
            ),
        ).toThrow();
    },
);
test('dense ambiguous endpoints hit a work budget rather than an unbounded pair scan', () => {
    const shapes = Array.from({ length: 1600 }, (_, i) =>
        path(String(i), [
            [0, 0],
            [i + 10, 10],
        ]),
    );
    expect(() => request(shapes)).toThrow('Too many nearby endpoints');
});
