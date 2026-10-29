import {
    findCornerIntersection,
    intersectionConnector,
} from './cornerIntersections';
const lines = [
    {
        id: 'a',
        points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
        ],
    },
    {
        id: 'b',
        points: [
            { x: 20, y: 0 },
            { x: 20, y: 20 },
        ],
    },
];
test.each(['fillet', 'chamfer'] as const)(
    'adds a %s connector at touching lines without changing either source',
    (tool) => {
        const before = JSON.stringify(lines);
        const hit = findCornerIntersection(
            lines,
            ['a', 'b'],
            [],
            { x: 19.9, y: 0.1 },
            1,
        )!;
        const path = intersectionConnector(hit, 2, tool)!;
        expect(path[0].x).toBeCloseTo(18);
        expect(path[0].y).toBeCloseTo(0);
        expect(path[path.length - 1].x).toBeCloseTo(20);
        expect(path[path.length - 1].y).toBeCloseTo(2);
        expect(path).toHaveLength(tool === 'fillet' ? 9 : 2);
        expect(JSON.stringify(lines)).toBe(before);
    },
);
test('crossing straight lines use the hovered quadrant even without a vertex there', () => {
    const paths = [
        {
            id: 'a',
            points: [
                { x: -20, y: 0 },
                { x: 20, y: 0 },
            ],
        },
        {
            id: 'b',
            points: [
                { x: 0, y: -20 },
                { x: 0, y: 20 },
            ],
        },
    ];
    const hit = findCornerIntersection(
        paths,
        ['a', 'b'],
        [],
        { x: -0.2, y: 0.2 },
        1,
    )!;
    const arc = intersectionConnector(hit, 2, 'fillet')!;
    expect(arc.every((p) => p.x <= 1e-8 && p.y >= -1e-8)).toBe(true);
    expect(arc[0].x).toBeCloseTo(-2);
    expect(arc[arc.length - 1].y).toBeCloseTo(2);
});
test('hidden, unselected and parallel lines are not join targets', () => {
    expect(
        findCornerIntersection(lines, ['a', 'b'], ['b'], { x: 20, y: 0 }, 1),
    ).toBeNull();
    expect(
        findCornerIntersection(lines, ['a'], [], { x: 20, y: 0 }, 1),
    ).toBeNull();
    expect(
        findCornerIntersection(
            [
                {
                    id: 'a',
                    points: [
                        { x: 0, y: 0 },
                        { x: 20, y: 0 },
                    ],
                },
                {
                    id: 'b',
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                    ],
                },
            ],
            [],
            [],
            { x: 0, y: 0 },
            1,
        ),
    ).toBeNull();
});
test('oversized connectors reject without changing the lines', () => {
    const hit = findCornerIntersection(lines, [], [], { x: 20, y: 0 }, 1)!;
    expect(intersectionConnector(hit, 30, 'fillet')).toBeNull();
    expect(intersectionConnector(hit, 30, 'chamfer')).toBeNull();
});
test('an acute-angle fillet keeps the requested radius instead of silently clamping its tangent points', () => {
    const target = {
        point: { x: 0, y: 0 },
        first: { x: 100, y: 0 },
        second: { x: 100, y: 100 / Math.sqrt(3) },
        loopIds: ['a', 'b'] as [string, string],
    };
    const arc = intersectionConnector(target, 2, 'fillet')!;
    const tangent = 2 / Math.tan(Math.PI / 12);
    expect(arc[0].x).toBeCloseTo(tangent);
    expect(arc.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(
        true,
    );
});
