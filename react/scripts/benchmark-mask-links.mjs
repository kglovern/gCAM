import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import {
    resolveLinkedImageMask,
    linkedMaskExportError,
} from '../src/lib/image-mask.ts';
const rectangle = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 0, y: 0 },
];
const imageLoop = { id: 'outline', bitmapId: 'image', points: rectangle };
const image = {
    id: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    dataUrl: 'source',
    maskSourceIds: ['mask'],
};
const unrelated = Array.from({ length: 20000 }, (_, i) => ({
    id: 'other-' + i,
    points: [
        { x: i % 100, y: Math.floor(i / 100) },
        { x: (i % 100) + 1, y: Math.floor(i / 100) },
    ],
}));
const trials = [];
for (const sourcePoints of [1000, 20000])
    for (const operations of [1, 10]) {
        const shape = {
            id: 'mask',
            points: Array.from({ length: sourcePoints }, (_, i) => {
                const a =
                    (i === sourcePoints - 1 ? 0 : i / (sourcePoints - 1)) *
                    2 *
                    Math.PI;
                return { x: 50 + 30 * Math.cos(a), y: 50 + 30 * Math.sin(a) };
            }),
        };
        const loops = [imageLoop, shape, ...unrelated];
        const normalized = resolveLinkedImageMask(image, loops);
        const stack = Array.from({ length: operations }, (_, i) => ({
            id: 'job-' + i,
            label: 'Raster ' + i,
            args: {
                operation: 'laser-raster',
                loops: [imageLoop],
                laserOptions: {
                    maskSourceIds: ['mask'],
                    imageMask: normalized.map((poly) =>
                        poly.map((p) => ({ ...p })),
                    ),
                },
            },
            toolpath: {},
            preview: [],
        }));
        for (let repeat = -1; repeat < 5; repeat++)
            for (const mode of repeat % 2
                ? ['per-job', 'batch']
                : ['batch', 'per-job']) {
                const started = performance.now();
                // Same validator and fixtures; per-job prevents sharing within one validation pass.
                const error =
                    mode === 'batch'
                        ? linkedMaskExportError(stack, loops, [image])
                        : stack
                              .map((entry) =>
                                  linkedMaskExportError([entry], loops, [
                                      image,
                                  ]),
                              )
                              .find(Boolean);
                const milliseconds = performance.now() - started;
                if (error) throw new Error(error);
                if (repeat >= 0)
                    trials.push({
                        mode,
                        sourcePoints,
                        operations,
                        unrelatedShapes: unrelated.length,
                        repeat,
                        milliseconds,
                    });
            }
    }
const result = {
    scope: 'Direct current-validator comparison in Node: separate per-job calls versus one batch call, 20k unrelated drawing records, 1k/20k-point closed mask and one/ten enabled raster operations. Same inputs and validator; order alternates. Fixture construction and one warmup per mode excluded. No UI, scene painting, image processing, G-code, peak-memory, competitor or controller measurement.',
    node: process.version,
    trials,
};
const directory = new URL('../../outputs/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
    new URL('laser-mask-links-validation-comparison.json', directory),
    JSON.stringify(result, null, 2),
);
for (const sourcePoints of [1000, 20000])
    for (const operations of [1, 10])
        for (const mode of ['per-job', 'batch']) {
            const times = trials
                .filter(
                    (t) =>
                        t.mode === mode &&
                        t.sourcePoints === sourcePoints &&
                        t.operations === operations,
                )
                .map((t) => t.milliseconds)
                .sort((a, b) => a - b);
            console.log({
                mode,
                sourcePoints,
                operations,
                min: times[0],
                median: times[2],
                max: times[4],
            });
        }
