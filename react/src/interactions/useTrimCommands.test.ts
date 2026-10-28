import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ViewLoop } from '../canvas/types';
import { useTrimCommands } from './useTrimCommands';
const line = (id: string, x: number): ViewLoop => ({
    id,
    points: [
        { x, y: -5 },
        { x, y: 5 },
    ],
});
function setup(initial: ViewLoop[]) {
    const pushHistory = jest.fn();
    let id = 0;
    const hook = renderHook(() => {
        const [loops, setLoops] = useState(initial),
            [selected, setSelected] = useState<string[]>([]),
            [stack, setStack] = useState([1]);
        const commands = useTrimCommands({
            loops,
            selected,
            hidden: [],
            setLoops,
            setSelected,
            setStack,
            pushHistory,
            newLoopId: () => `new-${++id}`,
            refreshBounds: jest.fn(),
            setStatus: jest.fn(),
        });
        return { loops, stack, ...commands };
    });
    return { ...hook, pushHistory };
}
test('stroke trimming uses intersection bounds and records one undo step', () => {
    const initial = [
        {
            id: 'target',
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
        },
        line('a', 3),
        line('b', 7),
    ];
    const { result, pushHistory } = setup(initial);
    act(() => result.current.handleTrimStroke([{ x: 5, y: 0 }]));
    expect(result.current.loops).toHaveLength(4);
    expect(
        result.current.loops
            .filter((l) => l.id.startsWith('new'))
            .map((l) => l.points),
    ).toEqual([
        [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
        ],
        [
            { x: 7, y: 0 },
            { x: 10, y: 0 },
        ],
    ]);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(result.current.stack).toEqual([]);
});
test('trimming a circle clears stale circle export metadata and preserves layer/group', () => {
    const points = Array.from({ length: 33 }, (_, i) => ({
        x: 5 + 5 * Math.cos((i * Math.PI) / 16),
        y: 5 + 5 * Math.sin((i * Math.PI) / 16),
    }));
    const initial: ViewLoop[] = [
        {
            id: 'circle',
            points,
            sourceType: 'circle',
            radius: 5,
            exportGeometry: { type: 'circle' },
            layerId: 'layer',
            groupId: 'group',
        },
        {
            id: 'boundary',
            points: [
                { x: 5, y: -1 },
                { x: 5, y: 11 },
            ],
        },
        { id: 'bitmap', points: [], bitmapId: 'image' },
    ];
    const copy = JSON.stringify(initial);
    const { result, pushHistory } = setup(initial);
    act(() => result.current.handleTrimAt({ x: 10, y: 5 }));
    const trimmed = result.current.loops.find((l) => l.id.startsWith('new'))!;
    expect(trimmed).toBeDefined();
    expect(trimmed.sourceType).toBeUndefined();
    expect(trimmed.exportGeometry).toBeUndefined();
    expect(trimmed.radius).toBeUndefined();
    expect(trimmed.layerId).toBe('layer');
    expect(trimmed.groupId).toBe('group');
    expect(result.current.loops.some((l) => l.bitmapId === 'image')).toBe(true);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(initial)).toBe(copy);
});
