/** @jest-environment node */
import { jest } from '@jest/globals';
const path = {
    entry: {
        id: 'saved',
        operation: 'finish',
        tool: { dia: 3 },
        ops: { finish: true },
    },
    moves: [{ x: 1 }],
    flags: [],
    compR: 0,
};
const planRotaryJob = jest.fn(() => ({
    paths: [path],
    moves: path.moves,
    flags: [],
}));
const planRotaryEntry = jest.fn(() => ({ ...path, moves: [{ x: 2 }] }));
jest.unstable_mockModule('./job', () => ({
    planRotaryJob,
    planRotaryEntry,
    toolpathSettingsKey: ({ operation, tool, ops }) =>
        JSON.stringify([operation, tool, ops]),
}));
const worker = { postMessage: jest.fn() };
globalThis.self = worker;
await import('./mesh-planner.worker');

test('saving an unchanged draft reuses the job calculation', () => {
    planRotaryEntry.mockClear();
    worker.onmessage({
        data: { entries: [path.entry], draft: { ...path.entry, id: 'draft' } },
    });
    expect(planRotaryEntry).not.toHaveBeenCalled();
    expect(worker.postMessage.mock.lastCall[0].draft.moves).toBe(path.moves);
    expect(worker.postMessage.mock.lastCall[0].draft.entry.id).toBe('draft');
});
test('a changed cutter requires a new draft calculation', () => {
    planRotaryEntry.mockClear();
    worker.onmessage({
        data: {
            entries: [path.entry],
            draft: { ...path.entry, id: 'draft', tool: { dia: 2 } },
        },
    });
    expect(planRotaryEntry).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.lastCall[0].draft.moves).toEqual([{ x: 2 }]);
});

test('worker reports monotonic progress separately from its final result', () => {
    worker.postMessage.mockClear();
    planRotaryJob.mockImplementationOnce((...args) => {
        args[6](0.5);
        args[6](1);
        return { paths: [path], moves: path.moves, flags: [] };
    });
    planRotaryEntry.mockImplementationOnce((...args) => {
        args[6](0.5);
        args[6](0.4);
        args[6](1);
        return path;
    });
    worker.onmessage({
        data: {
            entries: [path.entry],
            draft: { ...path.entry, tool: { dia: 2 } },
        },
    });
    expect(
        worker.postMessage.mock.calls.slice(0, -1).map(([m]) => m.progress),
    ).toEqual([0, 25, 50, 75, 99]);
    expect(worker.postMessage.mock.lastCall[0]).toHaveProperty('job');
});

test('profile requests sample their Bezier geometry in the worker and use profile mode', () => {
    planRotaryEntry.mockClear();
    worker.onmessage({
        data: {
            mode: 'profile',
            entries: [path.entry],
            samples: [],
            points: [
                {
                    x: 30,
                    r: 5,
                    type: 'smooth',
                    h1: { x: 30, r: 5 },
                    h2: { x: 31, r: 15 },
                },
                {
                    x: 50,
                    r: 5,
                    type: 'smooth',
                    h1: { x: 49, r: 0 },
                    h2: { x: 50, r: 5 },
                },
            ],
            draft: { ...path.entry, tool: { dia: 2 } },
        },
    });
    expect(planRotaryEntry.mock.lastCall[1].length).toBeGreaterThan(16);
    expect(planRotaryEntry.mock.lastCall[3]).toBe('profile');
    expect(worker.postMessage.mock.lastCall[0]).toHaveProperty('draft');
});
