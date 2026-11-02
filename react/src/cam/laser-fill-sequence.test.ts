import { createLaserToolpath, hatchPaths } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { laserTravel } from './laser-order.js';
import { pointInPolygon } from './geometry/polygons.js';
const rect = (x: number, y: number, w: number, h: number) => ({
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const loops = [
    rect(-10, -5, 20, 16),
    rect(-6, -2, 12, 10),
    rect(-2, 1, 4, 4),
    rect(90, 0, 10, 10),
];
const config = (options = {}) =>
    makeToolpathConfig({
        operation: 'laser-fill',
        toolDiameter: 1,
        cutDepth: 1,
        laserPower: 400,
        laserFeed: 1200,
        laserSpot: 1,
        laserOverscan: 0,
        laserOptions: options,
    });
const edges = (tp: ReturnType<typeof createLaserToolpath>) =>
    tp.laserPaths
        .map((path) =>
            path.points
                .map((p) => [p.x.toFixed(6), p.y.toFixed(6)].join(','))
                .sort()
                .join(':'),
        )
        .sort();
test.each([0, 31, 90, -45])(
    'individual fills preserve holes, islands and shared scan phase at %s degrees',
    (angle) => {
        const all = createLaserToolpath(loops, config({ fillAngle: angle }));
        const individual = createLaserToolpath(
            loops,
            config({ fillAngle: angle, fillSequence: 'individual' }),
        );
        expect(edges(individual)).toEqual(edges(all));
        for (const path of individual.laserPaths) {
            const [a, b] = path.points;
            const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            expect(
                loops.reduce(
                    (n, loop) =>
                        n + Number(pointInPolygon(middle, loop.points)),
                    0,
                ) % 2,
            ).toBe(1);
        }
    },
);
test('individual islands reduce blank travel while all remains the default', () => {
    const shapes = [rect(0, 0, 10, 20), rect(100, 0, 10, 20)];
    const defaultFill = createLaserToolpath(shapes, config());
    expect(defaultFill.laserOptions.fillSequence).toBe('all');
    const separate = createLaserToolpath(
        shapes,
        config({ fillSequence: 'individual' }),
    );
    expect(laserTravel(separate.laserPaths)).toBeLessThan(
        laserTravel(defaultFill.laserPaths) * 0.2,
    );
    expect(edges(separate)).toEqual(edges(defaultFill));
});
test('crosshatch and changing pass angles retain coverage and pass boundaries', () => {
    const all = createLaserToolpath(
        loops,
        config({ passes: 2, angleIncrement: 45, crosshatch: true }),
    );
    const separate = createLaserToolpath(
        loops,
        config({
            passes: 2,
            angleIncrement: 45,
            crosshatch: true,
            fillSequence: 'individual',
        }),
    );
    expect(edges(separate)).toEqual(edges(all));
    expect(
        separate.laserPaths
            .filter((p) => p.laserPassStart)
            .map((p) => p.laserPassStart),
    ).toEqual([1, 2]);
});
test('offset filling preserves its full contour set while sequencing islands separately', () => {
    const all = createLaserToolpath(loops, config({ fillMode: 'offset' }));
    const separate = createLaserToolpath(
        loops,
        config({ fillMode: 'offset', fillSequence: 'individual' }),
    );
    const perimeter = (tp: typeof all) =>
        tp.laserPaths.reduce(
            (total, path) =>
                total +
                path.points
                    .slice(1)
                    .reduce(
                        (n, p, i) =>
                            n +
                            Math.hypot(
                                p.x - path.points[i].x,
                                p.y - path.points[i].y,
                            ),
                        0,
                    ),
            0,
        );
    expect(perimeter(separate)).toBeCloseTo(perimeter(all), 6);
});
test('grouped fill enforces the combined pass/point budget and rejects unknown modes', () => {
    expect(() =>
        createLaserToolpath(loops, config({ fillSequence: 'individual' }), {
            _pointBudget: 8,
        }),
    ).toThrow(/dense|large/);
    const bad = config();
    Object.assign(bad.laserOptions!, { fillSequence: 'unknown' });
    expect(() => createLaserToolpath(loops, bad)).toThrow(/sequence/);
});

test('hatch precision too coarse to advance a row is rejected before scanning', () => {
    expect(() => hatchPaths([rect(0, 1e16, 10, 4).points], 1, 0)).toThrow(
        /precision/,
    );
});
