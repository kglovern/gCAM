import { jest } from '@jest/globals';
import {
    rebuildLaserOperations,
    mergeRebuiltLaserOperations,
} from './rebuild-laser-operations';
import type { ToolpathStackEntry } from './useToolpathStack';
import type { ToolpathResult, RasterBitmap } from '../lib/engine';

const make = (
    id: string,
    operation: 'laser-cut' | 'laser-raster' = 'laser-cut',
): ToolpathStackEntry => ({
    id,
    label: id,
    customLabel: id,
    outputEnabled: false,
    args: {
        operation,
        toolDiameter: 1,
        cutDepth: 1,
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                ],
            },
        ],
        laserFeed: 1500,
        laserPower: 500,
        laserSMax: 500,
        laserOptions: {
            imageCrop: { left: 0.25, bottom: 0, right: 0.75, top: 1 },
            imageMask: [],
            scanAngle: 90,
            angleIncrement: 90,
        },
    },
    preview: [],
    toolpath: { id, laserPaths: [] },
});
const result: ToolpathResult = {
    gcode: 'G1 S250',
    label: 'generated',
    previewContours: [
        [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
        ],
    ],
    trochoidPreviewContours: [],
    toolpath: {
        laserPaths: [
            {
                points: [
                    { x: 0, y: 0, power: 0 },
                    { x: 1, y: 0, power: 250 },
                ],
            },
        ],
    },
};
const bitmap: RasterBitmap = {
    imageData: { width: 1, height: 1, data: [0, 0, 0, 255] },
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
};

test('stages complete vector and raster rebuilds while retaining identity, region and output metadata', async () => {
    const entries = [make('a'), make('b', 'laser-raster')];
    const before = JSON.stringify(entries);
    const build = jest.fn(async () => result);
    const resolveBitmap = jest.fn(() => bitmap);
    const changed = await rebuildLaserOperations(
        entries,
        { feed: 900, power: 250, passes: 2 },
        { signal: new AbortController().signal, resolveBitmap, build },
    );
    expect(changed).toHaveLength(2);
    expect(changed[1]).toMatchObject({
        id: 'b',
        label: 'b',
        customLabel: 'b',
        outputEnabled: false,
        args: {
            laserFeed: 900,
            laserPower: 250,
            laserSMax: 250,
            laserOptions: { passes: 2, scanAngle: 90, angleIncrement: 90 },
        },
    });
    expect(changed[1].args.laserOptions?.imageCrop).toBe(
        entries[1].args.laserOptions?.imageCrop,
    );
    expect(changed[1].args.loops).toBe(entries[1].args.loops);
    expect(changed[1].preview).toHaveLength(1);
    expect(changed[1].toolpath.label).toBe('b');
    expect(resolveBitmap).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(entries)).toBe(before);
});

test('validation happens before building and unchanged fields do not create a rebuild', async () => {
    const build = jest.fn(async () => result);
    const entries = [
        make('a'),
        {
            ...make('b', 'laser-raster'),
            args: { ...make('b', 'laser-raster').args, laserSMin: 400 },
        },
    ];
    const options = {
        signal: new AbortController().signal,
        resolveBitmap: () => bitmap,
        build,
        maxFeed: 2000,
    };
    await expect(
        rebuildLaserOperations(entries, { power: 250 }, options),
    ).rejects.toThrow('minimum power');
    expect(build).not.toHaveBeenCalled();
    await expect(
        rebuildLaserOperations(entries, { feed: 1500 }, options),
    ).resolves.toEqual([]);
    expect(build).not.toHaveBeenCalled();
    await expect(
        rebuildLaserOperations(entries, { passes: 1.5 }, options),
    ).rejects.toThrow('whole number');
    await expect(
        rebuildLaserOperations(entries, { feed: 3000 }, options),
    ).rejects.toThrow('feed limit');
});

test('failure or cancellation after a completed entry never returns partial updates', async () => {
    const entries = [make('a'), make('b')];
    const before = JSON.stringify(entries);
    let calls = 0;
    await expect(
        rebuildLaserOperations(
            entries,
            { power: 250 },
            {
                signal: new AbortController().signal,
                resolveBitmap: () => bitmap,
                build: async () => {
                    if (++calls === 2) throw new Error('Worker failed');
                    return result;
                },
            },
        ),
    ).rejects.toThrow('Worker failed');
    expect(calls).toBe(2);
    const controller = new AbortController();
    const build = jest.fn(async () => {
        controller.abort();
        return result;
    });
    await expect(
        rebuildLaserOperations(
            entries,
            { feed: 900 },
            { signal: controller.signal, resolveBitmap: () => bitmap, build },
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(build).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(entries)).toBe(before);
});

test('final merge preserves other edits and rejects stale selected entries', () => {
    const a = make('a'),
        b = make('b');
    const changed = { ...a, label: 'Updated' };
    const other = { ...b, outputEnabled: true };
    expect(mergeRebuiltLaserOperations([a, other], [a], [changed])).toEqual([
        changed,
        other,
    ]);
    const stale = [{ ...a }, other];
    expect(mergeRebuiltLaserOperations(stale, [a], [changed])).toBe(stale);
});
