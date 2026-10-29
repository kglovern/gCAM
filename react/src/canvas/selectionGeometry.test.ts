/**
 * Tests: selection frame ignores hidden geometry; snap priority is endpoints, then guides, then grid.
 */
import {
    findDrawSnapTarget,
    findLoopAtPoint,
    constrainDrawAngle,
    selectionFrame,
    snapDrawPoint,
} from './selectionGeometry';

const loops = [
    {
        id: 'square',
        points: [
            { x: 1, y: 2 },
            { x: 5, y: 2 },
            { x: 5, y: 6 },
            { x: 1, y: 6 },
        ],
    },
];

test('selection frame ignores hidden geometry', () => {
    expect(selectionFrame(loops, ['square'], [])).toEqual({
        minX: 1,
        minY: 2,
        maxX: 5,
        maxY: 6,
    });
    expect(selectionFrame(loops, ['square'], ['square'])).toBeNull();
});

test('snap priority is vector endpoints, midpoints, edges, guides, axes, then grid', () => {
    expect(
        snapDrawPoint(loops, [], { x: 1.2, y: 2.1 }, 10, {
            snap: true,
            spacingMm: 5,
        }),
    ).toEqual({ x: 1, y: 2 });
    expect(
        snapDrawPoint([], [], { x: 10.2, y: 4.9 }, 10, null, [
            {
                id: 'guide',
                point: { x: 10, y: 0 },
                direction: { x: 0, y: 1 },
            },
        ]),
    ).toEqual({ x: 10, y: 4.9 });
});

test('guide intersections snap before projecting onto an individual guide', () => {
    const guides = [
        { id: 'horizontal', point: { x: 0, y: 5 }, direction: { x: 1, y: 0 } },
        { id: 'vertical', point: { x: 10, y: 0 }, direction: { x: 0, y: 1 } },
    ];
    expect(
        findDrawSnapTarget([], [], { x: 10.2, y: 5.1 }, 10, null, guides),
    ).toMatchObject({
        point: { x: 10, y: 5 },
        kind: 'guide-intersection',
        label: 'Guide intersection',
    });
});

test('finds a vector outline for hover feedback with a screen-sized hit target', () => {
    expect(findLoopAtPoint(loops, [], { x: 3, y: 2.5 }, 10)).toMatchObject({
        loopId: 'square',
        segmentIndex: 0,
    });
    expect(findLoopAtPoint(loops, [], { x: 3, y: 2.5 }, 10, 4)).toBeNull();
    expect(findLoopAtPoint(loops, ['square'], { x: 3, y: 2.5 }, 10)).toBeNull();
});

test('snaps to vector midpoint and edge before the grid', () => {
    expect(
        findDrawSnapTarget(
            [
                {
                    id: 'line',
                    sourceType: 'line',
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                    ],
                },
            ],
            [],
            { x: 5.1, y: 0.2 },
            10,
            { snap: true, spacingMm: 5 },
        ),
    ).toMatchObject({
        point: { x: 5, y: 0 },
        kind: 'midpoint',
        label: 'Midpoint',
    });
    expect(
        findDrawSnapTarget(
            [
                {
                    id: 'line',
                    sourceType: 'line',
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                    ],
                },
            ],
            [],
            { x: 3.2, y: 0.2 },
            10,
            { snap: true, spacingMm: 5 },
        ),
    ).toMatchObject({
        point: { x: 3.2, y: 0 },
        kind: 'edge',
        label: 'On shape',
    });
});

test('ignores hidden and bitmap geometry and labels axis/grid snaps', () => {
    expect(
        findDrawSnapTarget(
            [
                {
                    id: 'hidden',
                    points: [
                        { x: 1, y: 1 },
                        { x: 2, y: 1 },
                    ],
                },
                {
                    id: 'image',
                    bitmapId: 'image',
                    points: [
                        { x: 1, y: 1 },
                        { x: 2, y: 1 },
                    ],
                },
            ],
            ['hidden'],
            { x: 4.9, y: 0.2 },
            10,
            { snap: true, spacingMm: 5 },
        ),
    ).toMatchObject({
        kind: 'x-axis',
        label: 'X axis',
        point: { x: 4.9, y: 0 },
    });
    expect(
        findDrawSnapTarget([], [], { x: 7.4, y: 8.1 }, 10, {
            snap: true,
            spacingMm: 5,
        }),
    ).toMatchObject({ kind: 'grid', label: 'Grid', point: { x: 5, y: 10 } });
});

test('constrains drawing angles to 15 degree increments while preserving length', () => {
    const point = constrainDrawAngle({ x: 10, y: 9 }, { x: 0, y: 0 });
    expect(Math.atan2(point.y, point.x) * (180 / Math.PI)).toBeCloseTo(45);
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(Math.hypot(10, 9));
});
