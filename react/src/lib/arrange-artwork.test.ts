import {
    arrangeArtwork,
    assertLayoutSourcesUnchanged,
    LAYOUT_ACTIONS,
    type LayoutAction,
    type LayoutSource,
} from './arrange-artwork';
import type { ViewLoop } from '../canvas/types';
const rect = (
    id: string,
    x: number,
    y: number,
    w = 10,
    h = 10,
    groupId?: string,
): ViewLoop => ({
    id,
    groupId,
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const source = (): LayoutSource => ({
    shapes: [
        rect('a', 0, 0, 10, 10, 'ring'),
        rect('hole', 2, 2, 6, 6, 'ring'),
        rect('b', 30, 20, 20, 10),
        rect('c', 90, 60, 10, 20),
    ],
    order: ['a', 'b', 'c'],
    bitmaps: [],
});
const bound = (s: ViewLoop, axis: 'x' | 'y') => [
    Math.min(...s.points.map((p) => p[axis])),
    Math.max(...s.points.map((p) => p[axis])),
];
test.each([
    'left',
    'centerX',
    'right',
    'bottom',
    'centerY',
    'top',
] as LayoutAction[])(
    'aligns groups to the last selected unit: %s',
    (action) => {
        const input = source(),
            before = JSON.stringify(input),
            result = arrangeArtwork(input, action);
        const axis = ['left', 'centerX', 'right'].includes(action) ? 'x' : 'y';
        const position = (s: ViewLoop) => {
            const b = bound(s, axis);
            return action.startsWith('center')
                ? (b[0] + b[1]) / 2
                : ['left', 'bottom'].includes(action)
                  ? b[0]
                  : b[1];
        };
        expect(position(result.shapes[0])).toBe(position(input.shapes[3]));
        expect(position(result.shapes[2])).toBe(position(input.shapes[3]));
        expect(result.shapes[3]).toBe(input.shapes[3]);
        expect(result.units).toBe(3);
        expect(result.movedUnits).toBe(2);
        for (const key of ['x', 'y'] as const)
            expect(
                result.shapes[1].points[0][key] -
                    result.shapes[0].points[0][key],
            ).toBe(2);
        expect(JSON.stringify(input)).toBe(before);
    },
);
test('anchor follows selection order rather than drawing order', () => {
    const input = { ...source(), order: ['c', 'a', 'b'] };
    const result = arrangeArtwork(input, 'left');
    expect(bound(result.shapes[0], 'x')[0]).toBe(30);
    expect(result.shapes[2]).toBe(input.shapes[2]);
});
test.each(['spaceX', 'spaceY', 'centresX', 'centresY'] as LayoutAction[])(
    'distributes variable-size units while preserving both ends: %s',
    (action) => {
        const input = source(),
            result = arrangeArtwork(input, action),
            axis = action.endsWith('X') ? 'x' : 'y';
        const units = [result.shapes[0], result.shapes[2], result.shapes[3]],
            boxes = units.map((s) => bound(s, axis));
        if (action.startsWith('space'))
            expect(boxes[1][0] - boxes[0][1]).toBeCloseTo(
                boxes[2][0] - boxes[1][1],
                10,
            );
        else
            expect(
                (boxes[1][0] + boxes[1][1] - boxes[0][0] - boxes[0][1]) / 2,
            ).toBeCloseTo(
                (boxes[2][0] + boxes[2][1] - boxes[1][0] - boxes[1][1]) / 2,
                10,
            );
        expect(result.shapes[0]).toBe(input.shapes[0]);
        expect(result.shapes[3]).toBe(input.shapes[3]);
    },
);
test('equal gaps allow existing overlap without silently clamping the spacing', () => {
    const result = arrangeArtwork(
        {
            shapes: [
                rect('a', 0, 0, 30),
                rect('b', 5, 0, 10),
                rect('c', 20, 0, 10),
            ],
            order: ['a', 'b', 'c'],
            bitmaps: [],
        },
        'spaceX',
    );
    expect(bound(result.shapes[1], 'x')[0]).toBe(20);
    expect(
        bound(result.shapes[1], 'x')[0] - bound(result.shapes[0], 'x')[1],
    ).toBe(-10);
});
test.each(['packX', 'packY'] as LayoutAction[])(
    'packs edges around the last selected anchor: %s',
    (action) => {
        const input = { ...source(), order: ['a', 'c', 'b'] },
            result = arrangeArtwork(input, action),
            axis = action.endsWith('X') ? 'x' : 'y';
        const boxes = [
            result.shapes[0],
            result.shapes[2],
            result.shapes[3],
        ].map((s) => bound(s, axis));
        expect(boxes[0][1]).toBe(boxes[1][0]);
        expect(boxes[1][1]).toBe(boxes[2][0]);
        expect(result.shapes[2]).toBe(input.shapes[2]);
    },
);
test('translated circle landmarks and bitmap placement move with geometry without changing image data or rotation', () => {
    const image = {
        id: 'image',
        x: 0,
        y: 0,
        w: 10,
        h: 20,
        rotation: 30,
        dataUrl: 'pixels',
    };
    const bitmap = { ...rect('outline', -5, 0, 20, 22), bitmapId: 'image' };
    const circle = {
        ...rect('circle', 30, 0),
        exportGeometry: { type: 'circle', cx: 35, cy: 5, radius: 5 },
        sourceType: 'circle',
        radius: 5,
    };
    const result = arrangeArtwork(
        {
            shapes: [bitmap, circle, rect('anchor', 50, 40)],
            bitmaps: [image],
            order: ['outline', 'circle', 'anchor'],
        },
        'left',
    );
    expect(result.bitmaps[0]).toEqual({ ...image, x: 55 });
    expect(result.shapes[1].exportGeometry).toEqual({
        type: 'circle',
        cx: 55,
        cy: 5,
        radius: 5,
    });
    expect(bound(result.shapes[0], 'x')).toEqual([50, 70]);
    expect(image.x).toBe(0);
});
test('already aligned units create no changes', () => {
    const input = {
        ...source(),
        shapes: [rect('a', 0, 0), rect('b', 0, 20)],
        order: ['a', 'b'],
    };
    expect(arrangeArtwork(input, 'left').changedIds).toEqual([]);
});
test('stale geometry, image pixels/placement and added group members reject the staged commit', () => {
    const input = source();
    expect(() =>
        assertLayoutSourcesUnchanged(input.shapes, [], input),
    ).not.toThrow();
    expect(() =>
        assertLayoutSourcesUnchanged(
            [rect('a', 1, 0), ...input.shapes.slice(1)],
            [],
            input,
        ),
    ).toThrow('Source shapes changed');
    expect(() =>
        assertLayoutSourcesUnchanged(
            [...input.shapes, rect('extra', 0, 50, 5, 5, 'ring')],
            [],
            input,
        ),
    ).toThrow('Source groups changed');
    const image = { id: 'image', x: 0, y: 0, w: 10, h: 10, dataUrl: 'pixels' },
        withImage = { ...input, bitmaps: [image] };
    expect(() =>
        assertLayoutSourcesUnchanged(
            input.shapes,
            [{ ...image, x: 1 }],
            withImage,
        ),
    ).toThrow('Source images changed');
    expect(() =>
        assertLayoutSourcesUnchanged(
            input.shapes,
            [{ ...image, dataUrl: 'changed' }],
            withImage,
        ),
    ).toThrow('Source images changed');
});
test('validates selection, distribution count, bitmap dependencies and coordinate limits', () => {
    expect(() =>
        arrangeArtwork({ ...source(), shapes: [rect('a', 0, 0)] }, 'left'),
    ).toThrow('at least two');
    expect(() =>
        arrangeArtwork(
            { ...source(), shapes: [rect('a', 0, 0), rect('b', 20, 20)] },
            'spaceX',
        ),
    ).toThrow('at least three');
    expect(() => arrangeArtwork(source(), 'unknown' as LayoutAction)).toThrow(
        'settings',
    );
    expect(() =>
        arrangeArtwork(
            {
                ...source(),
                shapes: [
                    { ...rect('a', 0, 0), bitmapId: 'missing' },
                    rect('b', 20, 20),
                ],
            },
            'left',
        ),
    ).toThrow('image is missing');
    expect(() =>
        arrangeArtwork(
            {
                ...source(),
                shapes: [
                    { id: 'a', points: [{ x: NaN, y: 0 }] },
                    rect('b', 0, 0),
                ],
            },
            'left',
        ),
    ).toThrow('invalid coordinates');
    expect(Object.keys(LAYOUT_ACTIONS)).toHaveLength(12);
});
test('bounds source size and translated extents, and rejects conflicting moves of one image', () => {
    expect(() =>
        arrangeArtwork(
            { ...source(), shapes: Array(10001).fill(rect('a', 0, 0)) },
            'left',
        ),
    ).toThrow('settings');
    expect(() =>
        arrangeArtwork(
            {
                ...source(),
                shapes: [
                    { id: 'a', points: Array(1000001).fill({ x: 0, y: 0 }) },
                    rect('b', 10, 10),
                ],
            },
            'left',
        ),
    ).toThrow('too detailed');
    expect(() =>
        arrangeArtwork(
            {
                shapes: [rect('a', 0, 0, 30, 5), rect('b', 999995, 0, 5, 5)],
                bitmaps: [],
                order: ['a', 'b'],
            },
            'left',
        ),
    ).toThrow('coordinate limits');
    const image = { id: 'image', x: 0, y: 0, w: 10, h: 10, dataUrl: 'pixels' };
    expect(() =>
        arrangeArtwork(
            {
                shapes: [
                    { ...rect('a', 0, 0), bitmapId: 'image' },
                    { ...rect('b', 20, 0), bitmapId: 'image' },
                ],
                bitmaps: [image],
                order: ['a', 'b'],
            },
            'left',
        ),
    ).toThrow('same image');
});
