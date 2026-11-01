import { jest } from '@jest/globals';
import { createRequire } from 'node:module';
import {
    exportProgramInWorker,
    createToolpathInWorker,
    buildGcodeInWorker,
    terminateWorker,
    processLaserImageInWorker,
    traceBitmapInWorker,
    vectorBitmapInWorker,
    repairPathsInWorker,
    flattenImageInWorker,
    arrangeArtworkInWorker,
} from './cam-worker-client';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
import { buildToolpathGcodeAsync } from '../lib/engine';

const workers = [];
class FakeWorker {
    listeners = {};
    terminate = jest.fn();
    postMessage = jest.fn((message) => {
        this.request = message;
    });
    constructor(url) {
        this.url = String(url);
        workers.push(this);
    }
    addEventListener(name, listener) {
        this.listeners[name] = listener;
    }
    complete(result) {
        this.listeners.message({ data: { id: this.request.id, result } });
    }
}
const originalWorker = globalThis.Worker;
const originalRequire = globalThis.require;
const originalFilename = globalThis.__filename;
beforeEach(() => {
    workers.length = 0;
    globalThis.Worker = FakeWorker;
    globalThis.require = createRequire(`${process.cwd()}/package.json`);
    globalThis.__filename = `${process.cwd()}/src/engine/cam-worker-client.ts`;
});
afterEach(() => {
    terminateWorker();
    globalThis.Worker = originalWorker;
    globalThis.require = originalRequire;
    globalThis.__filename = originalFilename;
});
const request = {
    toolpaths: [],
    fileName: 'job',
    arcs: false,
    units: 'metric',
    settings: DEFAULT_OUTPUT,
};
test('arrangement uses the cancellable artwork worker without copying image pixels', async () => {
    const source = {
        shapes: [],
        order: [],
        bitmaps: [
            {
                id: 'image',
                x: 0,
                y: 0,
                w: 10,
                h: 10,
                dataUrl: 'large-pixel-source',
            },
        ],
    };
    const task = arrangeArtworkInWorker(source, 'left');
    expect(workers[0].url).toContain('path-repair.worker.ts');
    expect(workers[0].request.request.source.bitmaps[0]).not.toHaveProperty(
        'dataUrl',
    );
    const rejected = expect(task.promise).rejects.toMatchObject({
        name: 'AbortError',
    });
    task.cancel();
    workers[0].complete({ changedIds: ['stale'] });
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(source.bitmaps[0].dataUrl).toBe('large-pixel-source');
});
test('artwork group identity reaches the request-owned CAM worker', async () => {
    const task = createToolpathInWorker(
        [
            {
                id: 'a',
                groupId: 'word',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
            },
        ],
        { operation: 'laser-fill' },
    );
    expect(workers[0].request.selectedLoops[0].groupId).toBe('word');
    workers[0].complete({ id: 'job' });
    await expect(task).resolves.toEqual({ id: 'job' });
});
test('trace pixels use a transferable buffer in a request-owned worker and close on completion', async () => {
    const data = new Uint8ClampedArray(16);
    const task = traceBitmapInWorker({
        image: { width: 2, height: 2, data },
        placement: { x: 0, y: 0, width: 10, height: 10 },
        options: {
            brightness: 0,
            contrast: 0,
            threshold: 128,
            invert: false,
            turdsize: 2,
        },
    });
    expect(workers[0].request.type).toBe('trace-bitmap');
    expect(workers[0].url).toContain('trace.worker.ts');
    expect(workers[0].postMessage.mock.calls[0][1]).toEqual([data.buffer]);
    workers[0].complete([]);
    await expect(task.promise).resolves.toEqual([]);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
});
test('cancelling a trace terminates only its own worker and rejects stale output', async () => {
    const make = () =>
        traceBitmapInWorker({
            image: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
            placement: { x: 0, y: 0, width: 10, height: 10 },
            options: {
                brightness: 0,
                contrast: 0,
                threshold: 128,
                invert: false,
                turdsize: 2,
            },
        });
    const first = make(),
        second = make();
    const cancelled = expect(first.promise).rejects.toMatchObject({
        name: 'AbortError',
    });
    first.cancel();
    workers[0].complete(['stale']);
    workers[1].complete([]);
    await cancelled;
    await expect(second.promise).resolves.toEqual([]);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
});

test('geometry-only planning omits the emitter worker and reports full progress; default builds still emit', async () => {
    const args = {
        operation: 'laser-cut',
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
        ],
        toolDiameter: 1,
        cutDepth: 1,
    };
    const toolpath = {
        id: 'one',
        label: 'Laser',
        operation: 'laser-cut',
        previewContours: [],
        motionPaths: [],
        tabs: [],
        laserPaths: [],
        laserOptions: { passes: 1 },
    };
    const progress = jest.fn();
    const geometry = buildToolpathGcodeAsync({
        ...args,
        geometryOnly: true,
        onProgress: progress,
    });
    expect(workers).toHaveLength(1);
    expect(workers[0].request.type).toBe('build-toolpath');
    expect(workers[0].request.config).not.toHaveProperty('geometryOnly');
    expect(workers[0].request.toolpathOptions.validateResult).toBe(true);
    workers[0].listeners.message({
        data: {
            id: workers[0].request.id,
            progress: { percent: 50, label: 'Planning' },
        },
    });
    expect(progress).toHaveBeenCalledWith(50, 'Planning');
    workers[0].complete(toolpath);
    const result = await geometry;
    expect(result.gcode).toBe('');
    expect(result.toolpath).toBe(toolpath);
    expect(workers).toHaveLength(1);
    expect(progress).toHaveBeenLastCalledWith(100, 'Toolpath ready');
    const normal = buildToolpathGcodeAsync(args);
    workers[1].complete(toolpath);
    await Promise.resolve();
    expect(workers).toHaveLength(3);
    expect(workers[2].request.type).toBe('build-gcode');
    workers[2].complete('G1 X10 S500');
    await expect(normal).resolves.toMatchObject({
        gcode: 'G1 X10 S500',
        toolpath,
    });
});

test('processed image jobs use isolated cancellable workers and preserve pixel results', async () => {
    const input = {
        bitmap: {
            bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
            _imageData: {
                width: 1,
                height: 1,
                data: new Uint8ClampedArray([0, 0, 0, 255]),
            },
        },
        interval: 0.1,
        gamma: 1,
        options: {},
    };
    const job = processLaserImageInWorker(input);
    expect(workers[0].request.type).toBe('process-laser-image');
    const cancelled = expect(job.promise).rejects.toMatchObject({
        name: 'AbortError',
    });
    job.cancel();
    await cancelled;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const next = processLaserImageInWorker(input);
    const result = {
        width: 1,
        height: 1,
        widthMm: 1,
        heightMm: 1,
        data: new Uint8ClampedArray([0, 0, 0, 255]),
    };
    workers[0].complete('obsolete');
    workers[1].complete(result);
    await expect(next.promise).resolves.toEqual(result);
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
});

test('laser planning and canonical emission are abortable without cancelling another job', async () => {
    const controller = new AbortController();
    const progress = jest.fn();
    const planned = createToolpathInWorker(
        [],
        { operation: 'laser-raster' },
        {
            signal: controller.signal,
            onProgress: progress,
        },
    );
    workers[0].listeners.message({
        data: {
            id: workers[0].request.id,
            progress: { percent: 40, label: 'Engraving image rows' },
        },
    });
    expect(progress).toHaveBeenCalledWith({
        percent: 40,
        label: 'Engraving image rows',
    });
    const cancelled = expect(planned).rejects.toMatchObject({
        name: 'AbortError',
    });
    controller.abort();
    await cancelled;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const emittedController = new AbortController();
    const emitted = buildGcodeInWorker({
        toolpaths: [{ operation: 'laser-raster' }],
        fileName: 'job',
        forcePolylineArcs: true,
        signal: emittedController.signal,
    });
    const stopped = expect(emitted).rejects.toMatchObject({
        name: 'AbortError',
    });
    emittedController.abort();
    await stopped;
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
    await expect(
        createToolpathInWorker(
            [],
            { operation: 'laser-raster' },
            {
                signal: controller.signal,
            },
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(2);
});

test('cancelling an export terminates only its worker and settles the request', async () => {
    const milling = createToolpathInWorker([], {});
    const old = exportProgramInWorker(request);
    const next = exportProgramInWorker(request);
    const cancelled = expect(old.promise).rejects.toMatchObject({
        name: 'AbortError',
    });
    old.cancel();
    old.cancel();
    await cancelled;
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(workers[2].terminate).not.toHaveBeenCalled();
    workers[1].complete('obsolete');
    workers[2].complete('new program');
    await expect(next.promise).resolves.toBe('new program');
    expect(workers[2].terminate).toHaveBeenCalledTimes(1);
    next.cancel();
    expect(workers[2].terminate).toHaveBeenCalledTimes(1);
    workers[0].complete({ label: 'milling' });
    await expect(milling).resolves.toEqual({ label: 'milling' });
});

test('errors and clone failures release the export worker', async () => {
    const failed = exportProgramInWorker(request);
    workers[0].listeners.message({
        data: {
            id: workers[0].request.id,
            error: 'Invalid power',
            stack: null,
        },
    });
    await expect(failed.promise).rejects.toThrow('Invalid power');
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);

    const crashed = exportProgramInWorker(request);
    workers[1].listeners.error({ message: 'Worker crashed' });
    await expect(crashed.promise).rejects.toThrow('Worker crashed');
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);

    const post = FakeWorker.prototype.addEventListener;
    FakeWorker.prototype.addEventListener = function (...args) {
        post.apply(this, args);
        this.postMessage = () => {
            throw new Error('Cannot clone');
        };
    };
    try {
        await expect(exportProgramInWorker(request).promise).rejects.toThrow(
            'Cannot clone',
        );
        expect(workers[2].terminate).toHaveBeenCalledTimes(1);
    } finally {
        FakeWorker.prototype.addEventListener = post;
    }
});

test('bitmap conversion owns its worker, ignores stale messages and cancels independently', async () => {
    const request = {
        shapes: [],
        fillIds: [],
        render: 'outline',
        dpi: 300,
        lineWidth: 0.2,
    };
    const first = vectorBitmapInWorker(request);
    const cancelled = expect(first.promise).rejects.toThrow(/cancel/i);
    const second = vectorBitmapInWorker(request);
    expect(workers[0].url).toContain('vector-bitmap.worker.ts');
    workers[1].listeners.message({
        data: { id: workers[0].request.id, result: 'stale' },
    });
    first.cancel();
    await cancelled;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers[1].terminate).not.toHaveBeenCalled();
    workers[1].complete({ png: 'image' });
    await expect(second.promise).resolves.toEqual({ png: 'image' });
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
});

test('path repair runs in its own cancellable worker', async () => {
    const task = repairPathsInWorker({
        shapes: [],
        mode: 'join',
        closure: 'line',
        tolerance: 0.05,
    });
    expect(workers[0].url).toContain('path-repair.worker.ts');
    expect(workers[0].request.type).toBe('path-repair');
    const rejected = expect(task.promise).rejects.toThrow(/cancel/i);
    task.cancel();
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
});

test('flattening transfers source pixels into an isolated cancellable worker', async () => {
    const data = new Uint8ClampedArray(16),
        progress = jest.fn();
    const first = flattenImageInWorker(
        {
            image: { width: 2, height: 2, data },
            placement: { x: 0, y: 0, w: 20, h: 20 },
        },
        progress,
    );
    expect(workers[0].url).toContain('flatten-image.worker.ts');
    expect(workers[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'flatten-image' }),
        [data.buffer],
    );
    workers[0].listeners.message({
        data: {
            id: workers[0].request.id,
            progress: { percent: 40, label: 'Flattening image' },
        },
    });
    expect(progress).toHaveBeenCalledWith({
        percent: 40,
        label: 'Flattening image',
    });
    const cancelled = expect(first.promise).rejects.toThrow(/cancel/i);
    first.cancel();
    await cancelled;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    workers[0].complete('late result');
    const second = flattenImageInWorker({
        image: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
        placement: { x: 0, y: 0, w: 20, h: 20 },
    });
    workers[1].complete({ width: 1, height: 2 });
    await expect(second.promise).resolves.toEqual({ width: 1, height: 2 });
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
});
