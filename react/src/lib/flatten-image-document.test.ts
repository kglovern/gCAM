import {
    flattenedImageDocument,
    type FlattenImageCommit,
} from './flatten-image-document';
import { flattenImageRegion } from './flatten-image';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
const bitmap = {
    id: 'image',
    x: 0,
    y: 0,
    w: 20,
    h: 20,
    dataUrl: 'old pixels',
    assetId: 'old asset',
};
const shape = {
    id: 'outline',
    bitmapId: 'image',
    layerId: 'art',
    groupId: 'group',
    points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
        { x: 0, y: 0 },
    ],
};
const vector = { id: 'mask-vector', points: shape.points };
const entry = (id: string, loops: (typeof shape)[]) =>
    ({ id, args: { loops } }) as unknown as ToolpathStackEntry;
const result = flattenImageRegion({
    image: { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) },
    placement: bitmap,
    crop: { left: 0, bottom: 0, right: 0.5, top: 1 },
});
const commit: FlattenImageCommit = {
    source: bitmap,
    shapes: [shape],
    result,
    dataUrl: 'new PNG',
    img: {} as HTMLImageElement,
};
const affected = entry('old job', [shape]),
    unrelated = entry('other job', [{ ...shape, id: 'other' }]);
const current = {
    loops: [shape, vector],
    bitmaps: [bitmap],
    stack: [affected, unrelated],
};
test('replacement preserves layer/group/source shapes, removes only affected jobs and drops the stale asset ID', () => {
    const next = flattenedImageDocument(current, commit, 'new image');
    expect(next.bitmaps[0]).toMatchObject({
        id: 'new image',
        w: 10,
        h: 20,
        dataUrl: 'new PNG',
    });
    expect(next.bitmaps[0].assetId).toBeUndefined();
    expect(next.loops[0]).toMatchObject({
        id: 'outline',
        bitmapId: 'new image',
        layerId: 'art',
        groupId: 'group',
        points: result.points,
    });
    expect(next.loops[1]).toBe(vector);
    expect(next.stack).toEqual([unrelated]);
    expect(next.removed).toBe(1);
    expect(next.selected).toEqual(['outline']);
    expect(current.bitmaps[0]).toBe(bitmap);
    expect(current.stack).toHaveLength(2);
});
test('changed source pixels, placement, deleted or edited outlines reject stale replacement', () => {
    for (const source of [
        { ...bitmap, dataUrl: 'changed' },
        { ...bitmap, x: 1 },
    ])
        expect(() =>
            flattenedImageDocument(
                { ...current, bitmaps: [source] },
                commit,
                'new',
            ),
        ).toThrow(/Source image changed/);
    expect(() =>
        flattenedImageDocument({ ...current, bitmaps: [] }, commit, 'new'),
    ).toThrow(/Source image changed/);
    expect(() =>
        flattenedImageDocument({ ...current, loops: [vector] }, commit, 'new'),
    ).toThrow(/Source shapes changed/);
    expect(() =>
        flattenedImageDocument(
            { ...current, loops: [{ ...shape, points: [] }, vector] },
            commit,
            'new',
        ),
    ).toThrow(/Source shapes changed/);
});
test('new bitmap IDs must be unique and source outline ownership must match', () => {
    expect(() => flattenedImageDocument(current, commit, 'image')).toThrow(
        /Invalid flattened/,
    );
    expect(() =>
        flattenedImageDocument(
            current,
            { ...commit, shapes: [{ ...shape, bitmapId: 'other' }] },
            'new',
        ),
    ).toThrow(/Invalid flattened/);
});

test('live mask geometry is guarded without removing independent source-vector jobs', () => {
    const source = { ...bitmap, maskSourceIds: [vector.id] },
        linked = { ...commit, source, maskSources: [vector] };
    const document = { ...current, bitmaps: [source] };
    expect(() => flattenedImageDocument(document, linked, 'new')).not.toThrow();
    expect(() =>
        flattenedImageDocument(
            { ...document, loops: [shape, { ...vector, points: [] }] },
            linked,
            'new',
        ),
    ).toThrow(/Source shapes changed/);
    expect(() =>
        flattenedImageDocument(document, { ...linked, maskSources: [] }, 'new'),
    ).toThrow(/Linked mask sources changed/);
});
