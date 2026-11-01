import { createLaserToolpath } from './laser.js';
import {
    compositePocketGeometry,
    offsetCompositePolygons,
} from './geometry/polygons.js';
import { artworkFillGroups } from './laser-fill-groups.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';

const rect = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    groupId?: string,
) => ({
    id,
    ...(groupId ? { groupId } : {}),
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const config = (o = {}) =>
    makeToolpathConfig({
        operation: 'laser-fill',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 400,
        laserSpot: 1,
        laserOverscan: 0,
        laserOptions: o,
    });
const regions = (
    loops: ReturnType<typeof rect>[],
    kerf = 0,
): { x: number; y: number }[][][] => {
    const { paths, records } = compositePocketGeometry(loops, 1e-8);
    return artworkFillGroups(
        kerf ? offsetCompositePolygons(paths, kerf / 2, 1e-8) : paths,
        records,
    );
};
const coverage = (tp: ReturnType<typeof createLaserToolpath>) =>
    tp.laserPaths
        .map((p) =>
            p.points
                .map((q) => [q.x.toFixed(6), q.y.toFixed(6), q.power].join(','))
                .sort()
                .join(':'),
        )
        .sort();
const loops = [
    rect('a1', 0, 0, 10, 10, 'A'),
    rect('b1', 40, 0, 10, 10, 'B'),
    rect('a2', 15, 0, 10, 10, 'A'),
    rect('hole', 2, 2, 4, 4, 'A'),
    rect('inner', 3, 3, 2, 2, 'A'),
    rect('b2', 55, 0, 10, 10, 'B'),
];

test('disjoint islands follow artwork groups in first-source order with holes and nested islands intact', () => {
    const batches = regions(loops);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(4);
    expect(batches[1]).toHaveLength(2);
    expect(Math.max(...batches[0].flat().map((p) => p.x))).toBe(25);
    expect(Math.min(...batches[1].flat().map((p) => p.x))).toBe(40);
    expect(
        regions([loops[1], ...loops.filter((l) => l.id !== 'b1')])[0]
            .flat()
            .every((p) => p.x >= 40),
    ).toBe(true);
});
test.each([0, 31, -45, 90])(
    'group hatch retains identical powered coverage and scan phase at %i degrees',
    (fillAngle) => {
        const all = createLaserToolpath(loops, config({ fillAngle }));
        const groups = createLaserToolpath(
            loops,
            config({ fillAngle, fillSequence: 'groups' }),
        );
        expect(coverage(groups)).toEqual(coverage(all));
        const batches = groups.laserPaths.map((p) =>
            p.points.some((q) => q.x < 30) ? 'A' : 'B',
        );
        expect(
            batches.slice(0, batches.indexOf('B')).every((b) => b === 'A'),
        ).toBe(true);
        expect(
            batches.slice(batches.indexOf('B')).every((b) => b === 'B'),
        ).toBe(true);
    },
);
test.each([-0.5, 0.5])(
    'global kerf preserves coverage across grouped contours (%s)',
    (kerf) => {
        expect(
            coverage(
                createLaserToolpath(
                    loops,
                    config({ kerf, fillSequence: 'groups' }),
                ),
            ),
        ).toEqual(coverage(createLaserToolpath(loops, config({ kerf }))));
    },
);
test('crosshatch and alternating pass angles retain coverage and pass markers', () => {
    const o = { crosshatch: true, passes: 3, angleIncrement: 45 };
    const grouped = createLaserToolpath(
        loops,
        config({ ...o, fillSequence: 'groups' }),
    );
    expect(coverage(grouped)).toEqual(
        coverage(createLaserToolpath(loops, config(o))),
    );
    expect(
        grouped.laserPaths
            .filter((p) => p.laserPassStart)
            .map((p) => p.laserPassStart),
    ).toEqual([1, 2, 3]);
});
test('offset fill keeps the same contour coverage', () => {
    expect(
        coverage(
            createLaserToolpath(
                loops,
                config({ fillMode: 'offset', fillSequence: 'groups' }),
            ),
        ),
    ).toEqual(
        coverage(
            createLaserToolpath(
                loops,
                config({ fillMode: 'offset', fillSequence: 'individual' }),
            ),
        ),
    );
});
test('ungrouped contours use separate natural islands without filling their holes', () => {
    const shapes = loops.map(({ groupId: _, ...l }) => l);
    expect(regions(shapes)).toHaveLength(5);
    expect(
        coverage(
            createLaserToolpath(shapes, config({ fillSequence: 'groups' })),
        ),
    ).toEqual(coverage(createLaserToolpath(shapes, config())));
});
test('overlapping groups merge transitively, retaining group mates and engraving the union only once', () => {
    const shapes = [
        rect('a1', 0, 0, 10, 10, 'A'),
        rect('b1', 5, 0, 10, 10, 'B'),
        rect('a2', 30, 0, 10, 10, 'A'),
        rect('b2', 60, 0, 10, 10, 'B'),
    ];
    expect(regions(shapes)).toHaveLength(1);
    expect(
        coverage(
            createLaserToolpath(shapes, config({ fillSequence: 'groups' })),
        ),
    ).toEqual(coverage(createLaserToolpath(shapes, config())));
});
test('duplicate geometry keeps both group memberships without duplicate output', () => {
    const shapes = [
        rect('a1', 0, 0, 10, 10, 'A'),
        rect('b1', 0, 0, 10, 10, 'B'),
        rect('a2', 30, 0, 10, 10, 'A'),
        rect('b2', 60, 0, 10, 10, 'B'),
    ];
    expect(regions(shapes)).toHaveLength(1);
    expect(
        coverage(
            createLaserToolpath(shapes, config({ fillSequence: 'groups' })),
        ),
    ).toEqual(coverage(createLaserToolpath(shapes, config())));
});
test('a separate group inside a hole does not join its enclosing ring group', () => {
    const shapes = [
        rect('outer', 0, 0, 20, 20, 'ring'),
        rect('hole', 2, 2, 16, 16, 'ring'),
        rect('island', 5, 5, 5, 5, 'centre'),
    ];
    expect(regions(shapes)).toHaveLength(2);
});
test('positive kerf that merges islands also keeps their group mates together', () => {
    const shapes = [
        rect('a1', 0, 0, 10, 10, 'A'),
        rect('b1', 10.2, 0, 10, 10, 'B'),
        rect('a2', 30, 0, 10, 10, 'A'),
        rect('b2', 60, 0, 10, 10, 'B'),
    ];
    expect(regions(shapes, 1)).toHaveLength(1);
});
test.each(['', 'x'.repeat(513), 42])(
    'rejects invalid artwork group metadata even for one island',
    (groupId) => {
        const shapes = [{ ...rect('a', 0, 0, 10, 10), groupId }];
        expect(() =>
            createLaserToolpath(shapes, config({ fillSequence: 'groups' })),
        ).toThrow('Invalid artwork group');
    },
);
test('uses one combined point/pass budget and leaves source geometry unchanged', () => {
    const before = JSON.stringify(loops);
    expect(() =>
        createLaserToolpath(
            loops,
            config({ fillSequence: 'groups', passes: 2 }),
            { _pointBudget: 20 },
        ),
    ).toThrow(/dense|large/);
    expect(JSON.stringify(loops)).toBe(before);
});
test('bounds ownership comparisons for very large group selections', () => {
    const shapes = Array.from({ length: 2100 }, (_, i) =>
        rect(`r${i}`, i * 3, 0, 1, 1, `g${i}`),
    );
    expect(() => regions(shapes)).toThrow('Too many fill groups');
});
