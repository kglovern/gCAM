import {
    assertArtworkSourcesUnchanged,
    laserFillShapeIds,
    operationTouchesShapes,
    operationsTouchingShapes,
} from './vector-bitmap-document';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
const shape = {
    id: 'a',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ],
};
const entry = (loops: { id?: string; points: typeof shape.points }[]) =>
    ({ args: { loops } }) as ToolpathStackEntry;
test('source targeting uses IDs, with geometry fallback only for legacy ID-less paths', () => {
    expect(operationTouchesShapes(entry([shape]), [shape])).toBe(true);
    expect(
        operationTouchesShapes(entry([{ ...shape, id: 'other' }]), [shape]),
    ).toBe(false);
    expect(
        operationTouchesShapes(entry([{ points: shape.points }]), [shape]),
    ).toBe(true);
    expect(
        operationTouchesShapes(
            entry([
                {
                    points: [
                        { x: 2, y: 2 },
                        { x: 3, y: 3 },
                    ],
                },
            ]),
            [shape],
        ),
    ).toBe(false);
});
test('source changes and deletion reject replacement; unrelated changes are allowed', () => {
    expect(() =>
        assertArtworkSourcesUnchanged([shape, { ...shape, id: 'b' }], [shape]),
    ).not.toThrow();
    expect(() => assertArtworkSourcesUnchanged([], [shape])).toThrow('changed');
    expect(() =>
        assertArtworkSourcesUnchanged(
            [{ ...shape, points: [{ x: 2, y: 2 }] }],
            [shape],
        ),
    ).toThrow('changed');
});

test('fill target lookup ignores disabled and cut operations and supports legacy shapes', () => {
    const shapes = [
        shape,
        {
            ...shape,
            id: 'b',
            points: [
                { x: 20, y: 20 },
                { x: 30, y: 20 },
            ],
        },
        { ...shape, id: 'c' },
    ];
    const jobs = [
        {
            ...entry([shape]),
            args: { ...entry([shape]).args, operation: 'laser-fill' },
        },
        {
            ...entry([shapes[1]]),
            outputEnabled: false,
            args: { ...entry([shapes[1]]).args, operation: 'laser-fill' },
        },
        {
            ...entry([shapes[2]]),
            args: { ...entry([shapes[2]]).args, operation: 'laser-cut' },
        },
    ] as ToolpathStackEntry[];
    expect(laserFillShapeIds(jobs, shapes)).toEqual(['a']);
    const legacy = {
        ...jobs[0],
        args: { ...jobs[0].args, loops: [{ points: shapes[1].points }] },
    };
    expect(laserFillShapeIds([legacy], shapes)).toEqual(['b']);
});

test('batch source matching retains order and handles IDs and legacy paths together', () => {
    const a = entry([shape]),
        b = entry([{ id: 'other', points: shape.points }]),
        legacy = entry([{ points: shape.points }]);
    expect(operationsTouchingShapes([a, b, legacy], [shape])).toEqual([
        a,
        legacy,
    ]);
    expect(operationsTouchingShapes([a, b, legacy], [])).toEqual([]);
});

test('mask source dependencies invalidate only their linked image jobs', () => {
    const linked = {
        ...entry([{ ...shape, id: 'image' }]),
        args: {
            loops: [{ ...shape, id: 'image' }],
            laserOptions: { maskSourceIds: ['a'] },
        },
    } as unknown as ToolpathStackEntry;
    const other = entry([{ ...shape, id: 'other' }]);
    expect(operationTouchesShapes(linked, [shape])).toBe(true);
    expect(operationsTouchingShapes([linked, other], [shape])).toEqual([
        linked,
    ]);
});
