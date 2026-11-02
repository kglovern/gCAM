import {
    normalizedImageMask,
    resolveLinkedImageMask,
    linkedMaskExportError,
} from './image-mask';
import { validateImageMaskSources } from '../cam/raster-region.js';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
const rect = (id: string, l: number, b: number, r: number, t: number) => ({
    id,
    points: [
        { x: l, y: b },
        { x: r, y: b },
        { x: r, y: t },
        { x: l, y: t },
        { x: l, y: b },
    ],
});
const outer = rect('outer', 20, 10, 80, 40),
    hole = rect('hole', 40, 20, 60, 30),
    imageLoop = { ...rect('image-outline', 0, 0, 100, 50), bitmapId: 'image' };
const image = {
    id: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    dataUrl: 'pixels',
    maskSourceIds: ['outer', 'hole'],
};
const loops = [imageLoop, outer, hole];
const options = {
    maskSourceIds: image.maskSourceIds,
    imageMask: resolveLinkedImageMask(image, loops),
};
const entry = {
    id: 'job',
    label: 'Image job',
    args: {
        operation: 'laser-raster',
        loops: [imageLoop],
        laserOptions: options,
    },
    preview: [],
    toolpath: {},
} as unknown as ToolpathStackEntry;
test('linked masks follow source edits and use local coordinates on rotated non-square images', () => {
    expect(options.imageMask[0][0]).toEqual({ x: 0.2, y: 0.2 });
    const moved = {
        ...outer,
        points: outer.points.map((p) => ({ x: p.x + 10, y: p.y })),
    };
    expect(
        resolveLinkedImageMask(image, [imageLoop, moved, hole])[0][0].x,
    ).toBeCloseTo(0.3);
    const rotated = { ...image, rotation: 90 };
    const mask = resolveLinkedImageMask(rotated, loops);
    expect(mask).toEqual(
        normalizedImageMask([outer.points, hole.points], rotated),
    );
});
test('cached export is accepted only when linked outlines and image placement match', () => {
    expect(linkedMaskExportError([entry], loops, [image])).toBe('');
    expect(
        linkedMaskExportError(
            [entry],
            [
                imageLoop,
                {
                    ...outer,
                    points: outer.points.map((p) => ({ x: p.x + 1, y: p.y })),
                },
                hole,
            ],
            [image],
        ),
    ).toMatch(/Regenerate/);
    expect(linkedMaskExportError([entry], loops, [{ ...image, x: 1 }])).toMatch(
        /Regenerate/,
    );
    expect(
        linkedMaskExportError(
            [entry],
            [{ ...imageLoop, points: [] }, outer, hole],
            [image],
        ),
    ).toMatch(/Regenerate/);
    expect(
        linkedMaskExportError([entry], loops, [
            { ...image, maskSourceIds: ['outer'] },
        ]),
    ).toMatch(/Regenerate/);
    expect(
        linkedMaskExportError([{ ...entry, outputEnabled: false }], [], []),
    ).toBe('');
});
test('missing, open or bitmap source shapes fail rather than remove the mask', () => {
    expect(() => resolveLinkedImageMask(image, [imageLoop, outer])).toThrow(
        /missing/,
    );
    expect(() =>
        resolveLinkedImageMask(
            { ...image, maskSourceIds: ['image-outline'] },
            loops,
        ),
    ).toThrow(/missing/);
    expect(() =>
        resolveLinkedImageMask(
            { ...image, maskSourceIds: ['open'] },
            [rect('open', 0, 0, 10, 10)].map((l) => ({
                ...l,
                points: l.points.slice(0, -1),
            })),
        ),
    ).toThrow(/closed/);
    expect(linkedMaskExportError([entry], [imageLoop, outer], [image])).toMatch(
        /missing/,
    );
});
test.each([
    { ids: ['same', 'same'] },
    { ids: [''] },
    { ids: [42] },
    { ids: Array.from({ length: 1001 }, (_, i) => String(i)) },
])('malformed source IDs reject %p', ({ ids }) =>
    expect(() => validateImageMaskSources(ids)).toThrow(),
);
test('unlinked legacy snapshots remain unchanged and source limits reject before normalization', () => {
    expect(
        resolveLinkedImageMask({ ...image, maskSourceIds: undefined }, []),
    ).toEqual([]);
    expect(
        linkedMaskExportError(
            [
                {
                    ...entry,
                    args: {
                        ...entry.args,
                        laserOptions: { imageMask: options.imageMask },
                    },
                },
            ],
            loops,
            [{ ...image, maskSourceIds: undefined }],
        ),
    ).toBe('');
    expect(() =>
        normalizedImageMask(
            [Array.from({ length: 20001 }, () => ({ x: 0, y: 0 }))],
            image,
        ),
    ).toThrow(/detailed/);
});

test('jobs sharing a current mask still reject an independently stale cached snapshot', () => {
    const stale = {
        ...entry,
        id: 'stale',
        label: 'Second raster',
        args: {
            ...entry.args,
            laserOptions: {
                ...options,
                imageMask: options.imageMask.map((poly) =>
                    poly.map((p) => ({ x: p.x + 0.01, y: p.y })),
                ),
            },
        },
    };
    expect(linkedMaskExportError([entry, stale], loops, [image])).toMatch(
        /^Second raster:/,
    );
    expect(
        linkedMaskExportError(
            [entry, { ...stale, outputEnabled: false }],
            loops,
            [image],
        ),
    ).toBe('');
});
