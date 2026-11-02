import { prepareToolpathHistory } from './toolpathHistory';
import {
    cloneHistoryData,
    createHistory,
    pushHistory,
    undoHistory,
    redoHistory,
} from '../lib/history';
import type { ToolpathStackEntry } from './useToolpathStack';

const entry = (
    operation: 'laser-raster' | 'profile-outside',
): ToolpathStackEntry => ({
    id: 'test',
    label: 'Photo',
    args: {
        operation,
        loops: [],
        toolDiameter: 1,
        cutDepth: 1,
        laserOptions: { passes: 1 },
    },
    preview: [
        {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
            ],
            laserPower: 0.25,
        },
    ],
    toolpath: {
        operation,
        laserPaths: [
            {
                points: [
                    { x: 0, y: 0, power: 0 },
                    { x: 10, y: 10, power: 250 },
                ],
            },
        ],
        previewContours: [
            [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
            ],
        ],
        laserOptions: { passes: 1 },
    },
});
test('laser history shares deeply read-only output while settings remain independent', async () => {
    const source = entry('laser-raster');
    await prepareToolpathHistory([source]);
    const copy = cloneHistoryData([source])[0];
    expect(copy).not.toBe(source);
    expect(copy.preview).toBe(source.preview);
    expect(copy.toolpath.laserPaths).toBe(source.toolpath.laserPaths);
    expect(() => {
        copy.preview[0].points[0].x = 999;
    }).toThrow(TypeError);
    copy.args.laserOptions!.passes = 3;
    (copy.toolpath.laserOptions as { passes: number }).passes = 3;
    expect(source.args.laserOptions!.passes).toBe(1);
    expect((source.toolpath.laserOptions as { passes: number }).passes).toBe(1);
});

test('shared raster preview coordinates cannot mutate output through history', async () => {
    const source = entry('laser-raster');
    const paths = source.toolpath.laserPaths as {
        points: { x: number; y: number; power: number }[];
    }[];
    const preview = [[paths[0].points[0], paths[0].points[1]]];
    source.toolpath.previewContours = preview;
    source.preview[0].points = preview[0];
    const independent = cloneHistoryData(source);
    independent.preview[0].points[0].x = 50;
    expect(paths[0].points[0].x).toBe(0);
    await prepareToolpathHistory([source]);
    const snapshot = cloneHistoryData(source);
    expect(() => {
        snapshot.preview[0].points[1].x = 999;
    }).toThrow(TypeError);
    expect(paths[0].points[1].x).toBe(10);
});
test('Undo/Redo restores independent names, switches and settings while retaining shared geometry', async () => {
    const original = entry('laser-raster'),
        history = createHistory<ToolpathStackEntry[]>(10, cloneHistoryData);
    await prepareToolpathHistory([original]);
    pushHistory(history, [original]);
    const changed = {
        ...original,
        label: 'Changed',
        outputEnabled: false,
        args: { ...original.args, laserOptions: { passes: 4 } },
    };
    const restored = undoHistory(history, [changed])!;
    expect(restored[0].label).toBe('Photo');
    expect(restored[0].outputEnabled).toBeUndefined();
    expect(restored[0].args.laserOptions!.passes).toBe(1);
    const redone = redoHistory(history, restored)!;
    expect(redone[0].label).toBe('Changed');
    expect(redone[0].outputEnabled).toBe(false);
    expect(redone[0].args.laserOptions!.passes).toBe(4);
    expect(redone[0].preview).toBe(original.preview);
});
test('milling and older laser data keep deep-copy behavior', async () => {
    const milling = entry('profile-outside');
    const legacy = entry('laser-raster');
    delete legacy.toolpath.laserPaths;
    for (const source of [milling, legacy]) {
        await prepareToolpathHistory([source]);
        const copy = cloneHistoryData([source])[0];
        copy.preview[0].points[0].x = 999;
        expect(source.preview[0].points[0].x).toBe(0);
        expect(copy.toolpath).not.toBe(source.toolpath);
    }
});
