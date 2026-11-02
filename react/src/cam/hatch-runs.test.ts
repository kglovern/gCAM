import { joinHatchRuns } from './hatch-runs.js';
import { overscanFillPaths, alignScanPaths } from './scan-alignment.js';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';

type Point = { x: number; y: number; power: number };
type Path = {
    points: Point[];
    feed?: number;
    focusZMm?: number;
    laserPassStart?: number;
};
function paths(angle = 0): Path[] {
    const c = Math.cos((angle * Math.PI) / 180),
        s = Math.sin((angle * Math.PI) / 180);
    return [
        [0, 5],
        [6, 10],
        [15, 19],
    ].map((span) => ({
        points: span.map((x) => ({ x: 30 + x * c, y: 40 + x * s, power: 400 })),
    }));
}
const powered = (rows: Path[]) =>
    rows.flatMap((row) =>
        row.points
            .slice(1)
            .flatMap((end, index) =>
                end.power > 0
                    ? [
                          JSON.stringify([
                              row.points[index].x,
                              row.points[index].y,
                              end.x,
                              end.y,
                              end.power,
                          ]),
                      ]
                    : [],
            ),
    );
const bounds = (rows: Path[]) => {
    const points = rows.flatMap((row) => row.points);
    return [
        Math.min(...points.map((p) => p.x)),
        Math.min(...points.map((p) => p.y)),
        Math.max(...points.map((p) => p.x)),
        Math.max(...points.map((p) => p.y)),
    ];
};

test.each([0, 45, 90, 180, 270])(
    'joins nearby collinear runs at %s degrees with exact burn coverage and an S0 gap',
    (angle) => {
        const source = paths(angle),
            before = JSON.stringify(source);
        const joined = joinHatchRuns(source, 2);
        expect(joined.length).toBe(2);
        expect(joined[0].points.map((p) => p.power)).toEqual([
            400, 400, 0, 400,
        ]);
        const old = overscanFillPaths(source, 2),
            result = overscanFillPaths(joined, 2);
        expect(powered(result)).toEqual(powered(old));
        bounds(result).forEach((value, index) =>
            expect(value).toBeCloseTo(bounds(old)[index], 8),
        );
        expect(JSON.stringify(source)).toBe(before);
    },
);

test('keeps different feeds, focus/pass markers, row directions, wide gaps and non-monotone paths separate', () => {
    for (const change of [
        (p: Path) => ({ ...p, feed: 2000 }),
        (p: Path) => ({ ...p, focusZMm: 1 }),
        (p: Path) => ({ ...p, laserPassStart: 2 }),
        (p: Path) => ({ ...p, points: [...p.points].reverse() }),
        (p: Path) => ({
            ...p,
            points: p.points.map((v) => ({ ...v, y: v.y + 0.1 })),
        }),
        (p: Path) => ({
            ...p,
            points: p.points.map((v) => ({ ...v, x: v.x + 10 })),
        }),
        (p: Path) => ({
            ...p,
            points: [p.points[0], p.points[1], p.points[0], p.points[1]],
        }),
    ]) {
        const source = paths().slice(0, 2);
        source[1] = change(source[1]);
        expect(joinHatchRuns(source, 2).length).toBe(2);
    }
    const source = paths().slice(0, 2);
    source[0].laserPassStart = 1;
    expect(joinHatchRuns(source, 2)[0].laserPassStart).toBe(1);
    expect(joinHatchRuns(source, 2).length).toBe(1);
    expect(joinHatchRuns(source, 0)).toBe(source);
    expect(() => joinHatchRuns(source, NaN)).toThrow('overscan');
});

test('scan alignment retains the same powered coordinates after joining', () => {
    const calibration = {
        enabled: true,
        measurements: [
            { feed: 1000, gap: 0.2 },
            { feed: 2000, gap: 0.4 },
        ],
    };
    const source = paths(45);
    const old = overscanFillPaths(JSON.parse(JSON.stringify(source)), 2);
    const result = overscanFillPaths(
        joinHatchRuns(JSON.parse(JSON.stringify(source)), 2),
        2,
    );
    alignScanPaths(old, calibration, 1500);
    alignScanPaths(result, calibration, 1500);
    expect(powered(result)).toEqual(powered(old));
});

const rectangle = (x: number) => ({
    points: [
        { x, y: 5 },
        { x: x + 2, y: 5 },
        { x: x + 2, y: 6 },
        { x, y: 6 },
        { x, y: 5 },
    ],
});
const make = (extra = {}, budget = 2000000) =>
    createLaserToolpath(
        [
            rectangle(5),
            rectangle(8),
            rectangle(11),
            rectangle(14),
            rectangle(17),
        ],
        makeToolpathConfig({
            operation: 'laser-fill',
            toolDiameter: 1,
            cutDepth: 1,
            laserPower: 400,
            laserFeed: 1200,
            laserSpot: 1,
            laserOverscan: 2,
            laserOptions: extra,
        }),
        { _pointBudget: budget },
    );

test('default all-together hatch joins nearby islands while individual/group sequences retain their paths', () => {
    const result = make();
    expect(result.laserPaths.length).toBe(1);
    for (const fillSequence of ['individual', 'groups'])
        expect(make({ fillSequence }).laserPaths.length).toBe(5);
    expect(make({ hatchOverscan: false }).laserPaths.length).toBe(5);
    expect(powered(result.laserPaths)).toEqual(
        powered(make({ hatchOverscan: false }).laserPaths),
    );
});

test('checks the actual joined point budget before allocating outer run-ups', () => {
    expect(make({}, 12).laserPaths[0].points.length).toBe(12);
    expect(() => make({}, 11)).toThrow('too large');
    expect(() => make({ fillSequence: 'individual' }, 12)).toThrow('too large');
});

test('a long row appends linearly without argument spreading or source mutation', () => {
    const source = Array.from({ length: 20000 }, (_, index) => ({
        points: [
            { x: index * 3, y: 0, power: 400 },
            { x: index * 3 + 2, y: 0, power: 400 },
        ],
    }));
    const result = joinHatchRuns(source, 2);
    expect(result.length).toBe(1);
    expect(result[0].points.length).toBe(40000);
    expect(source[0].points.length).toBe(2);
    expect(source[1].points[0].power).toBe(400);
});
