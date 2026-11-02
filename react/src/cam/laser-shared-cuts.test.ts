import { removeSharedLaserCuts } from './laser-shared-cuts.js';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
const path = (pairs: number[][], power = 400) => ({
    points: pairs.map(([x, y]) => ({ x, y, power })),
});
const length = (paths: ReturnType<typeof path>[], powered = true) =>
    paths.reduce(
        (sum, p) =>
            sum +
            p.points
                .slice(1)
                .reduce(
                    (n, b, i) =>
                        n +
                        (b.power > 0 === powered
                            ? Math.hypot(
                                  b.x - p.points[i].x,
                                  b.y - p.points[i].y,
                              )
                            : 0),
                    0,
                ),
        0,
    );
test('partial, reversed and disjoint overlapping intervals cut their union once', () => {
    const input = [
        path([
            [2, 0],
            [4, 0],
        ]),
        path([
            [8, 0],
            [6, 0],
        ]),
        path([
            [10, 0],
            [0, 0],
        ]),
    ];
    const before = JSON.stringify(input);
    const result = removeSharedLaserCuts(input);
    expect(length(result)).toBe(10);
    expect(length(result, false)).toBe(4);
    expect(result[2].points.map((p: { x: number }) => p.x)).toEqual([
        10, 8, 6, 4, 2, 0,
    ]);
    expect(JSON.stringify(input)).toBe(before);
});
test('complete reversed duplicates disappear while nearby distinct lines remain', () => {
    const input = [
        path([
            [0, 0],
            [10, 10],
        ]),
        path([
            [10, 10],
            [0, 0],
        ]),
        path([
            [0, 0.001],
            [10, 10.001],
        ]),
    ];
    expect(removeSharedLaserCuts(input)).toHaveLength(2);
});
test('unpowered gaps do not claim coverage and original self retraces stay intact', () => {
    const first = path([
        [0, 0],
        [2, 0],
        [4, 0],
        [6, 0],
    ]);
    first.points[2].power = 0;
    const result = removeSharedLaserCuts([
        first,
        path([
            [0, 0],
            [6, 0],
        ]),
    ]);
    expect(length(result)).toBe(6);
    expect(length(result, false)).toBe(6);
    expect(
        removeSharedLaserCuts([
            path([
                [0, 0],
                [10, 0],
                [0, 0],
            ]),
        ])[0].points,
    ).toHaveLength(3);
});
test('shared square side remains closed beam-off geometry and obeys the allocation budget', () => {
    const a = path([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
    ]);
    const b = path([
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 0],
    ]);
    const result = removeSharedLaserCuts([a, b]);
    expect(length(result)).toBe(70);
    expect(result[1].points[0].power).toBe(0);
    expect(result[1].points[result[1].points.length - 1].power).toBe(0);
    expect(() => removeSharedLaserCuts([a, b], 9)).toThrow(/budget/);
});
test('CAM opt-in, passes, S0 emission and preview agree; default output is unchanged', () => {
    const loops = [
        path([
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
        ]),
        path([
            [10, 0],
            [20, 0],
            [20, 10],
            [10, 10],
            [10, 0],
        ]),
    ];
    const make = (removeSharedCuts: boolean) =>
        createLaserToolpath(
            loops,
            makeToolpathConfig({
                operation: 'laser-cut',
                toolDiameter: 1,
                cutDepth: 1,
                laserFeed: 1200,
                laserPower: 400,
                laserOptions: {
                    passes: 2,
                    innerFirst: false,
                    optimizeTravel: false,
                    removeSharedCuts,
                },
            }),
        );
    const plain = make(false),
        shared = make(true);
    expect(length(plain.laserPaths)).toBe(80);
    expect(length(shared.laserPaths)).toBe(70);
    expect(shared.previewContours.every((p) => p._laserVariablePower)).toBe(
        true,
    );
    const code = buildGcode({
        toolpaths: [shared],
        fileName: 'shared',
        forcePolylineArcs: true,
    });
    expect(code).toContain('S0');
    expect(code.match(/Laser pass/g)).toHaveLength(2);
    expect(code).not.toMatch(/M6|G[01] Z/);
});
