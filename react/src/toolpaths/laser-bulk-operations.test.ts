import {
    setLaserOutputs,
    duplicateLaserOperations,
    moveLaserOperations,
} from './laser-bulk-operations';
import type { ToolpathStackEntry } from './useToolpathStack';

const entry = (
    id: string,
    operation: 'laser-cut' | 'profile-outside' = 'laser-cut',
): ToolpathStackEntry => ({
    id,
    label: id,
    args: { operation, loops: [], toolDiameter: 1, cutDepth: 1 },
    preview: [
        {
            points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ],
        },
    ],
    toolpath: {
        laserPaths: [
            {
                points: [
                    { x: 0, y: 0, power: 0 },
                    { x: 1, y: 0, power: 500 },
                ],
            },
        ],
    },
});

test('bulk output edits only selected laser metadata, retaining geometry and unselected references', () => {
    const stack = [
        entry('mill', 'profile-outside'),
        entry('a'),
        entry('b'),
        entry('c'),
    ];
    const next = setLaserOutputs(stack, ['mill', 'a', 'b'], false);
    expect(next[0]).toBe(stack[0]);
    expect(next[3]).toBe(stack[3]);
    expect(next[1].outputEnabled).toBe(false);
    expect(next[2].outputEnabled).toBe(false);
    expect(next[1].toolpath).toBe(stack[1].toolpath);
    expect(stack[1].outputEnabled).toBeUndefined();
    expect(setLaserOutputs(next, ['a'], true)[1].outputEnabled).toBe(true);
    expect(setLaserOutputs(stack, ['a'], true)[1]).toBe(stack[1]);
});

test('moving selected groups preserves their order and does not cross nonlaser entries', () => {
    const stack = ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id));
    expect(
        moveLaserOperations(stack, ['b', 'c', 'e'], -1).map((e) => e.id),
    ).toEqual(['b', 'c', 'a', 'e', 'd']);
    expect(
        moveLaserOperations(stack, ['a', 'b', 'd'], 1).map((e) => e.id),
    ).toEqual(['c', 'a', 'b', 'e', 'd']);
    expect(moveLaserOperations(stack, ['a', 'b', 'c', 'd', 'e'], 1)).toEqual(
        stack,
    );
    expect(stack.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const mixed = [entry('mill', 'profile-outside'), entry('a')];
    expect(moveLaserOperations(mixed, ['a'], -1)).toEqual(mixed);
});

test('bulk duplication assigns independent IDs, retains output state and leaves originals unchanged', () => {
    const a = entry('a'),
        b = { ...entry('b'), outputEnabled: false },
        mill = entry('mill', 'profile-outside');
    const stack = [a, b, mill];
    const next = duplicateLaserOperations(stack, ['a', 'b', 'mill']);
    expect(next.map((e) => e.label)).toEqual([
        'a',
        'a copy',
        'b',
        'b copy',
        'mill',
    ]);
    expect(new Set(next.map((e) => e.id)).size).toBe(5);
    expect(next[0]).toBe(a);
    expect(next[2]).toBe(b);
    expect(next[3].outputEnabled).toBe(false);
    expect(next[1].toolpath.id).toBe(next[1].id);
    expect(next[1].customLabel).toBe('a copy');
    next[1].preview[0].points[0].x = 99;
    expect(a.preview[0].points[0].x).toBe(0);
});
