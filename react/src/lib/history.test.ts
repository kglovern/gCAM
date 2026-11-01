/**
 * Tests: undo restores earlier snapshots in order; redo replays after undo and clears on new push; undo stack respects the limit; snapshots are deep copies; and related cases.
 */
import {
    cloneHistoryData,
    freezeHistoryData,
    createHistory,
    pushHistory,
    redoHistory,
    undoHistory,
} from './history';

test('history data cloning omits geometry methods and preserves nested data', () => {
    const source = {
        points: [{ x: 1, y: 2 }],
        segment: {
            kind: 'polyline',
            reverse() {
                return 'runtime geometry method';
            },
        },
    };

    const copy = cloneHistoryData(source);

    expect(copy).toEqual({
        points: [{ x: 1, y: 2 }],
        segment: { kind: 'polyline' },
    });
    expect(copy).not.toBe(source);
    expect(copy.points).not.toBe(source.points);
});

test('undo restores earlier snapshots in order', () => {
    const h = createHistory<number[]>(10);
    pushHistory(h, [1]);
    pushHistory(h, [1, 2]);
    expect(undoHistory(h, [1, 2, 3])).toEqual([1, 2]);
    expect(undoHistory(h, [1, 2])).toEqual([1]);
    expect(undoHistory(h, [1])).toBeNull();
});

test('redo replays after undo and clears on new push', () => {
    const h = createHistory<number[]>(10);
    pushHistory(h, [1]);
    pushHistory(h, [2]);
    expect(undoHistory(h, [3])).toEqual([2]);
    expect(redoHistory(h, [2])).toEqual([3]);
    pushHistory(h, [4]);
    expect(redoHistory(h, [4])).toBeNull();
});

test('undo stack respects the limit', () => {
    const h = createHistory<number>(2);
    pushHistory(h, 1);
    pushHistory(h, 2);
    pushHistory(h, 3);
    expect(undoHistory(h, 4)).toBe(3);
    expect(undoHistory(h, 3)).toBe(2);
    expect(undoHistory(h, 2)).toBeNull();
});

test('snapshots are deep copies', () => {
    const h = createHistory<{ n: number[] }>(10);
    const snap = { n: [1] };
    pushHistory(h, snap);
    snap.n.push(999);
    expect(undoHistory(h, { n: [2] })).toEqual({ n: [1] });
});

test('accepts a document-aware clone for non-serializable UI handles', () => {
    const h = createHistory<{ bitmap: { id: string; image?: unknown } }>(
        10,
        (value) => ({ bitmap: { id: value.bitmap.id } }),
    );
    pushHistory(h, { bitmap: { id: 'asset-1', image: new Map() } });
    expect(undoHistory(h, { bitmap: { id: 'asset-2' } })).toEqual({
        bitmap: { id: 'asset-1' },
    });
});

test('only explicitly deep-frozen data is shared; shallow freezes and mutable built-ins remain independent', async () => {
    const shallow = Object.freeze({ points: [{ x: 1 }] });
    expect(cloneHistoryData(shallow).points).not.toBe(shallow.points);
    const sealed = await freezeHistoryData({ points: [{ x: 1 }] });
    expect(cloneHistoryData(sealed)).toBe(sealed);
    expect(Object.isFrozen(sealed.points[0])).toBe(true);
    const mixed = await freezeHistoryData({
        date: new Date(0),
        bytes: new Uint8Array([1]),
    });
    const copy = cloneHistoryData(mixed);
    copy.date.setTime(99);
    copy.bytes[0] = 9;
    expect(mixed.date.getTime()).toBe(0);
    expect(mixed.bytes[0]).toBe(1);
});

test('background preparation can be cancelled without losing independently copied history', async () => {
    const data = Array.from({ length: 100000 }, (_, x) => ({ x, y: x }));
    const controller = new AbortController();
    const pending = freezeHistoryData(data, controller.signal);
    controller.abort();
    await pending;
    const copy = cloneHistoryData(data);
    copy[copy.length - 1].x = -1;
    expect(data[data.length - 1].x).toBe(99999);
    expect(copy).not.toBe(data);
});
