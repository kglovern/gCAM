import { orderLaserCuts, laserTravel } from './laser-order.js';
import { buildGcode } from './gcode/program.js';
test('saved paths with an unsupported direction fail before emission', () => {
    expect(() =>
        buildGcode({
            toolpaths: [
                {
                    operation: 'laser-cut',
                    laserOptions: { cutOrder: 'diagonal' },
                },
            ],
            fileName: 'invalid-order',
            forcePolylineArcs: true,
        }),
    ).toThrow('cut order');
});
const square = (x: number, y: number, size: number) => ({
    points: [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
        { x, y },
    ],
});
const options = { innerFirst: true, optimizeTravel: true };
const midpointOutline = () => ({
    points: [
        { x: 0, y: 2 },
        { x: 10, y: 2 },
        { x: 10, y: 12 },
        { x: -10, y: 12 },
        { x: -10, y: 2 },
        { x: 0, y: 2 },
    ],
});
test.each([true, false])(
    'corner preference starts at a real corner with travel reduction %s',
    (optimizeTravel) => {
        const paths = [midpointOutline()],
            before = JSON.stringify(paths);
        expect(
            orderLaserCuts(paths, { ...options, optimizeTravel })[0].points[0],
        ).toEqual({ x: 0, y: 2 });
        const result = orderLaserCuts(paths, {
            ...options,
            optimizeTravel,
            preferCornerStarts: true,
        });
        expect(result[0].points[0]).toEqual({ x: 10, y: 2 });
        expect(edges(result)).toEqual(edges(paths));
        expect(JSON.stringify(paths)).toBe(before);
    },
);
test('smooth curves and open lines retain normal starts', () => {
    const circle = {
        points: Array.from({ length: 65 }, (_, i) => ({
            x: 20 + 10 * Math.cos(((i % 64) * Math.PI) / 32),
            y: 20 + 10 * Math.sin(((i % 64) * Math.PI) / 32),
        })),
    };
    const line = {
        points: [
            { x: 5, y: 0 },
            { x: 20, y: 0 },
        ],
    };
    expect(
        orderLaserCuts([circle, line], {
            ...options,
            preferCornerStarts: true,
        }),
    ).toEqual(orderLaserCuts([circle, line], options));
});
test('repeated coincident vertices do not turn straight segments into corner candidates', () => {
    const outline = midpointOutline();
    outline.points.splice(1, 0, { ...outline.points[0] });
    const result = orderLaserCuts([outline], {
        ...options,
        preferCornerStarts: true,
    });
    expect(result[0].points[0]).toEqual({ x: 10, y: 2 });
    expect(edges(result)).toEqual(edges([outline]));
});
test('corners adjacent to a holding gap are skipped without moving the gap', () => {
    const outline = {
        points: midpointOutline().points.map((p, i) => ({
            ...p,
            power: i === 1 ? 0 : 400,
        })),
    };
    const result = orderLaserCuts([outline], {
        ...options,
        preferCornerStarts: true,
    });
    expect(result[0].points[0]).toEqual({ x: -10, y: 2, power: 400 });
    const off = (points: typeof outline.points) =>
        points
            .slice(1)
            .filter((p) => p.power === 0)
            .map((p) => `${p.x},${p.y}`);
    expect(off(result[0].points)).toEqual(off(outline.points));
    expect(edges(result)).toEqual(edges([outline]));
});
test('invalid corner preference fails at generation and saved-file boundaries', () => {
    expect(() =>
        orderLaserCuts([midpointOutline()], {
            ...options,
            preferCornerStarts: 'yes' as unknown as boolean,
        }),
    ).toThrow('corner-start');
    expect(() =>
        buildGcode({
            toolpaths: [
                {
                    operation: 'laser-cut',
                    laserOptions: { preferCornerStarts: 'yes' },
                },
            ],
            fileName: 'invalid',
            forcePolylineArcs: true,
        }),
    ).toThrow('corner-start');
});
test.each([
    ['left-to-right', [1, 2, 0]],
    ['right-to-left', [0, 2, 1]],
    ['bottom-to-top', [2, 0, 1]],
    ['top-to-bottom', [1, 0, 2]],
] as const)(
    '%s respects spatial order with or without travel reduction',
    (cutOrder, expected) => {
        const paths = [
            square(50, 30, 5),
            square(0, 60, 5),
            square(20, 0, 5),
        ].map((p, id) => ({ ...p, id }));
        for (const optimizeTravel of [true, false]) {
            const result = orderLaserCuts(paths, {
                ...options,
                innerFirst: false,
                optimizeTravel,
                cutOrder,
            });
            expect(result.map((p) => p.id)).toEqual(expected);
            expect(edges(result)).toEqual(edges(paths));
        }
    },
);
test('direction ordering cannot cut an enclosing outline before its children', () => {
    const paths = [square(0, 0, 100), square(80, 80, 5), square(10, 10, 5)].map(
        (p, id) => ({ ...p, id }),
    );
    const result = orderLaserCuts(paths, {
        ...options,
        cutOrder: 'left-to-right',
    });
    expect(result.map((p) => p.id)).toEqual([2, 1, 0]);
});
test('equal directional ranks preserve drawing order when travel reduction is disabled', () => {
    const paths = [square(0, 80, 5), square(0, 0, 5)].map((p, id) => ({
        ...p,
        id,
    }));
    expect(
        orderLaserCuts(paths, {
            ...options,
            cutOrder: 'left-to-right',
            optimizeTravel: false,
        }).map((p) => p.id),
    ).toEqual([0, 1]);
    expect(
        orderLaserCuts(paths, { ...options, cutOrder: 'left-to-right' }).map(
            (p) => p.id,
        ),
    ).toEqual([1, 0]);
    expect(() =>
        orderLaserCuts(paths, { ...options, cutOrder: 'diagonal' }),
    ).toThrow('cut order');
});
test('direction ordering preserves physical bridges and perforation boundaries', () => {
    const paths = [square(0, 0, 20), square(50, 0, 20)].map((p, id) => ({
        ...p,
        id,
    }));
    const settings = {
        ...options,
        bridges: true,
        bridgeCount: 2,
        bridgeWidth: 1,
        perforation: true,
        perforationCut: 3,
        perforationSkip: 2,
    };
    const before = JSON.stringify(paths);
    const plain = orderLaserCuts(paths, settings),
        directional = orderLaserCuts(paths, {
            ...settings,
            cutOrder: 'right-to-left',
        });
    const segments = (points: { x: number; y: number; power?: number }[]) =>
        points
            .slice(1)
            .map(
                (p, i) =>
                    [points[i], p]
                        .map((v) => `${v.x},${v.y}`)
                        .sort()
                        .join(':') +
                    ':' +
                    (p.power === 0 ? 'off' : 'on'),
            )
            .sort();
    for (const path of directional)
        expect(segments(path.points)).toEqual(
            segments(plain.find((p) => p.id === path.id)!.points),
        );
    expect(JSON.stringify(paths)).toBe(before);
});
const edges = (paths: { points: { x: number; y: number }[] }[]) =>
    paths
        .flatMap(({ points }) =>
            points.slice(1).map((b, i) =>
                [points[i], b]
                    .map((p) => `${p.x},${p.y}`)
                    .sort()
                    .join(':'),
            ),
        )
        .sort();

test('contained shapes precede enclosing cuts rather than merely sorting area', () => {
    const outer = square(0, 0, 50),
        hole = square(30, 30, 10),
        unrelated = square(100, 0, 1);
    const result = orderLaserCuts([outer, hole, unrelated], {
        ...options,
        optimizeTravel: false,
    });
    expect(result.map((p) => p.points)).toEqual([
        hole.points,
        outer.points,
        unrelated.points,
    ]);
});
test('nearest starts and open-line reversal preserve every edge without mutating artwork', () => {
    const paths = [
        square(100, 100, 10),
        {
            points: [
                { x: 80, y: 0 },
                { x: 5, y: 0 },
            ],
        },
        square(0, 10, 2),
    ];
    const snapshot = JSON.stringify(paths),
        result = orderLaserCuts(paths, options);
    expect(edges(result)).toEqual(edges(paths));
    expect(JSON.stringify(paths)).toBe(snapshot);
    expect(result.find((path) => path.points.length === 2).points[0]).toEqual({
        x: 5,
        y: 0,
    });
    expect(laserTravel(result)).toBeLessThan(laserTravel(paths));
});
test('concave outlines do not contain a line spanning their notch', () => {
    const outer = {
        points: [
            [0, 0],
            [10, 0],
            [10, 10],
            [6, 10],
            [6, 3],
            [4, 3],
            [4, 10],
            [0, 10],
            [0, 0],
        ].map(([x, y]) => ({ x, y })),
    };
    const across = {
        points: [
            { x: 2, y: 5 },
            { x: 8, y: 5 },
        ],
    };
    expect(
        orderLaserCuts([outer, across], {
            ...options,
            optimizeTravel: false,
        })[0].points,
    ).toEqual(outer.points);
});
test('nested rings, duplicate outlines and disabled optimization remain deterministic', () => {
    const outer = square(0, 0, 40),
        middle = square(10, 10, 20),
        inner = square(15, 15, 2);
    const paths = [outer, middle, inner, square(0, 0, 40)];
    const result = orderLaserCuts(paths, { ...options, optimizeTravel: false });
    expect(result.map((p) => p.points)).toEqual([
        inner.points,
        middle.points,
        outer.points,
        paths[3].points,
    ]);
    expect(
        orderLaserCuts(paths, { innerFirst: false, optimizeTravel: false }).map(
            (p) => p.points,
        ),
    ).toEqual(paths.map((p) => p.points));
});
