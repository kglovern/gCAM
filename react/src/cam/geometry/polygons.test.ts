import { compositePocketSeedPaths } from './polygons.js';
import { polygonArea } from '../../geometry/bounds.js';
import { createLaserToolpath } from '../laser.js';
import { makeToolpathConfig } from '../../toolpaths/toolpathRequest';
const shape = (pairs: number[][]) => ({
    points: [...pairs, pairs[0]].map(([x, y]) => ({ x, y })),
});
const rect = (x: number, y: number, w: number, h: number) =>
    shape([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
    ]);
const area = (loops: ReturnType<typeof shape>[]) =>
    compositePocketSeedPaths(loops, 1e-8).reduce(
        (sum: number, points: { x: number; y: number }[]) =>
            sum + polygonArea(points),
        0,
    );
test('overlapping shapes union instead of treating the overlapping centre as a hole', () => {
    const loops = [rect(0, 0, 10, 10), rect(4, 2, 10, 6)];
    const before = JSON.stringify(loops);
    expect(area(loops)).toBeCloseTo(124, 8);
    expect(JSON.stringify(loops)).toBe(before);
    const tp = createLaserToolpath(
        loops,
        makeToolpathConfig({
            operation: 'laser-fill',
            toolDiameter: 1,
            cutDepth: 1,
            laserPower: 400,
            laserFeed: 1200,
            laserSpot: 1,
            laserOverscan: 0,
        }),
    );
    const y5 = tp.laserPaths.find((p) => Math.abs(p.points[0].y - 5.5) < 1e-8);
    expect(y5?.points.map((p) => p.x).sort((a, b) => a - b)).toEqual([0, 14]);
});
const concave = shape([
    [0, 0],
    [10, 0],
    [10, 3],
    [3, 3],
    [3, 7],
    [10, 7],
    [10, 10],
    [0, 10],
]);
const hole = shape([
    [0.5, 0.5],
    [9.5, 0.5],
    [9.5, 2.5],
    [2.5, 2.5],
    [2.5, 7.5],
    [9.5, 7.5],
    [9.5, 9.5],
    [0.5, 9.5],
]);
test.each([false, true])(
    'fully enclosed concave holes survive with reversed winding %s',
    (reverse) => {
        const loops = [concave, hole].map((r) => ({
            points: reverse ? r.points.slice().reverse() : r.points.slice(),
        }));
        expect(area(loops)).toBeCloseTo(26, 8);
    },
);
test('all vertices inside is insufficient when an edge crosses a concave notch', () => {
    expect(area([concave, rect(1, 1, 8, 8)])).toBeCloseTo(96, 8);
});
test('duplicate enclosing outlines and holes do not change fill winding', () => {
    const outer = rect(0, 0, 10, 10),
        inner = rect(2, 2, 6, 6);
    const rotated = {
        points: [
            ...outer.points.slice(2, -1),
            ...outer.points.slice(0, 2),
            outer.points[2],
        ],
    };
    expect(area([outer, rotated, inner])).toBe(64);
    expect(
        area([outer, inner, { points: inner.points.slice().reverse() }]),
    ).toBe(64);
    expect(area([outer, outer, inner, inner, rect(4, 4, 2, 2)])).toBe(68);
});
test('boundary-touching holes remain notches and separated outlines remain independent', () => {
    expect(area([rect(0, 0, 10, 10), rect(0, 2, 4, 6)])).toBe(76);
    expect(area([rect(0, 0, 10, 10), rect(20, 0, 3, 3)])).toBe(109);
});
