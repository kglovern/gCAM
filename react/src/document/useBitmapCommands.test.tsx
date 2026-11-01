import { jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import {
    useBitmapCommands,
    type PlacedBitmapRecord,
} from './useBitmapCommands';

test.each([true, false])(
    'bitmap append preserves toolpaths only in Laser (laser=%s)',
    (laserWorkspace) => {
        const setStack = jest.fn();
        const priorLoop = { id: 'old', points: [{ x: 1, y: 1 }] };
        let loops = [priorLoop];
        const noop = () => {};
        const { result } = renderHook(() =>
            useBitmapCommands<
                typeof priorLoop & { bitmapId?: string },
                unknown,
                PlacedBitmapRecord
            >({
                laserWorkspace,
                bounds: null,
                setBitmapImportChoice: noop,
                setLoops: (next) => {
                    loops = typeof next === 'function' ? next(loops) : next;
                },
                setSelected: noop,
                setStack,
                setBitmaps: noop,
                setFileName: noop,
                setStatus: noop,
                setDraftPreview: noop,
                pushHistory: noop,
                newLoopId: () => 'new',
                withIds: () => [],
                refreshBounds: noop,
                onFitView: noop,
            }),
        );
        act(() =>
            result.current.commitBitmapPlacement({
                fileName: 'next.png',
                entry: {
                    id: 'image',
                    x: 0,
                    y: 0,
                    w: 10,
                    h: 10,
                    dataUrl: 'data:image/png;base64,x',
                },
                rect: {
                    id: 'new',
                    points: [{ x: 0, y: 0 }],
                    bitmapId: 'image',
                },
            }),
        );
        expect(loops).toHaveLength(2);
        expect(loops[0]).toBe(priorLoop);
        if (laserWorkspace) expect(setStack).not.toHaveBeenCalled();
        else expect(setStack).toHaveBeenCalledWith([]);
    },
);

test.each([true, false])(
    'trace import delete source=%s retains the chosen artwork and history',
    (deleteSource) => {
        const bitmap = {
            id: 'image',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            dataUrl: 'data:image/png;base64,x',
        };
        const source = {
            id: 'source',
            bitmapId: 'image',
            points: [{ x: 0, y: 0 }],
        };
        const unrelated = {
            id: 'other',
            groupId: 'existing-group',
            points: [{ x: 20, y: 20 }],
        };
        type Loop = {
            id: string;
            points: { x: number; y: number }[];
            bitmapId?: string;
            groupId?: string;
        };
        let loops: Loop[] = [source, unrelated];
        let bitmaps = [bitmap];
        let selected: string[] = [];
        const history = jest.fn(),
            stack = jest.fn(),
            status = jest.fn();
        const noop = () => {};
        const { result } = renderHook(() =>
            useBitmapCommands<Loop, unknown, PlacedBitmapRecord>({
                laserWorkspace: true,
                bounds: null,
                setBitmapImportChoice: noop,
                setLoops: (next) => {
                    loops = typeof next === 'function' ? next(loops) : next;
                },
                setBitmaps: (next) => {
                    bitmaps = typeof next === 'function' ? next(bitmaps) : next;
                },
                setSelected: (next) => {
                    selected =
                        typeof next === 'function' ? next(selected) : next;
                },
                setStack: stack,
                setFileName: noop,
                setStatus: status,
                setDraftPreview: noop,
                pushHistory: history,
                newLoopId: () => 'trace',
                withIds: (items) =>
                    items.map((item, i) => ({ ...item, id: `trace-${i}` })),
                refreshBounds: noop,
                onFitView: noop,
            }),
        );
        act(() =>
            result.current.commitTraced(
                [
                    {
                        points: [
                            { x: 1, y: 1 },
                            { x: 2, y: 1 },
                            { x: 1, y: 1 },
                        ],
                    },
                    {
                        points: [
                            { x: 1.2, y: 1.2 },
                            { x: 1.5, y: 1.2 },
                            { x: 1.2, y: 1.2 },
                        ],
                    },
                ],
                deleteSource ? 'image' : undefined,
            ),
        );
        expect(history).toHaveBeenCalledTimes(1);
        expect(loops.some((loop) => loop.id === 'other')).toBe(true);
        expect(loops.some((loop) => loop.id === 'source')).toBe(!deleteSource);
        expect(bitmaps).toHaveLength(deleteSource ? 0 : 1);
        expect(selected).toEqual(['trace-0', 'trace-1']);
        const traces = loops.filter((loop) => loop.id.startsWith('trace-'));
        expect(traces[0].groupId).toEqual(expect.any(String));
        expect(traces[1].groupId).toBe(traces[0].groupId);
        expect(loops.find((loop) => loop.id === 'other')?.groupId).toBe(
            'existing-group',
        );
        if (deleteSource) expect(stack).toHaveBeenCalledWith([]);
        else expect(stack).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(
            expect.stringContaining(
                deleteSource ? 'bitmap replaced' : 'source image kept',
            ),
        );
    },
);
