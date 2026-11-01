import { laserOvercutPoints } from './laser-overcut.js';
import { createLaserToolpath, laserOptions } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
import { validateToolpaths } from './gcode-validation.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
];
const make = (options = {}, points = square) =>
    createLaserToolpath(
        [{ points }],
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: { overcut: 2.5, passes: 3, ...options },
        }),
    );
const code = (path: ReturnType<typeof make>) =>
    buildGcode({
        toolpaths: [path],
        fileName: 'overcut',
        forcePolylineArcs: true,
    });
function distances(program: string) {
    const result: number[] = [];
    let pass = -1,
        x = 0,
        y = 0;
    for (const line of program.split('\n')) {
        const marker = line.match(/^\(Laser pass (\d+)\)/);
        if (marker) {
            pass = Number(marker[1]) - 1;
            result[pass] = 0;
        }
        if (!/^G[01] /.test(line)) continue;
        const nextX = Number(line.match(/ X([-\d.]+)/)?.[1] ?? x),
            nextY = Number(line.match(/ Y([-\d.]+)/)?.[1] ?? y);
        if (pass >= 0 && line.startsWith('G1 '))
            result[pass] += Math.hypot(nextX - x, nextY - y);
        x = nextX;
        y = nextY;
    }
    return result;
}
test('only the final pass retraces the requested length, without an extra rapid', () => {
    const path = make(),
        program = code(path);
    expect(distances(program)).toEqual([40, 40, 42.5]);
    expect(program.match(/G0 X/g)).toHaveLength(3);
    expect(program).toContain('G1 X2.5 S400');
    expect(program).not.toMatch(/M6|G[01] Z/);
});
test('overcut follows corners and preserves original geometry', () => {
    const path = make({ overcut: 12 }),
        before = JSON.stringify(path.laserPaths);
    expect(distances(code(path))).toEqual([40, 40, 52]);
    const extra = laserOvercutPoints(path.laserPaths[0].points, 12)!;
    expect(extra).toHaveLength(3);
    expect(extra[2]).toEqual({ x: 10, y: 2, power: 400 });
    expect(JSON.stringify(path.laserPaths)).toBe(before);
});
test('perforation and holding bridge powers stay off through the repeated prefix', () => {
    const path = make({
        overcut: 7,
        perforation: true,
        perforationCut: 3,
        perforationSkip: 2,
        bridges: true,
        bridgeCount: 4,
        bridgeWidth: 2,
    });
    const extra = laserOvercutPoints(path.laserPaths[0].points, 7)!;
    for (let i = 1; i < extra.length; i++) {
        const middle = (extra[i - 1].x + extra[i].x) / 2;
        if (middle > 3 && middle < 6) expect(extra[i].power).toBe(0);
    }
    expect(distances(code(path))).toEqual([40, 40, 47]);
});
test('zero length and open contours retain ordinary emission', () => {
    const open = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ];
    expect(code(make({ overcut: 2.5 }, open))).toBe(
        code(make({ overcut: 0 }, open)),
    );
    expect(laserOvercutPoints(make().laserPaths[0].points, 0)).toBeUndefined();
    expect(distances(code(make({ overcut: 0 })))).toEqual([40, 40, 40]);
});
test('invalid or oversized saved overcuts and exhausted output budgets fail before emission', () => {
    expect(() => code(make({ overcut: 41 }))).toThrow(/perimeter/);
    for (const overcut of [NaN, -1, 10001]) {
        expect(() => laserOptions({ overcut })).toThrow();
        const path = make();
        path.laserOptions.overcut = overcut;
        expect(() => code(path)).toThrow(/overcut/);
    }
    const path = make({ passes: 100 });
    path.laserPaths[0].points = Array.from({ length: 20000 }, (_, i) => ({
        x: i === 1 ? 10 : 0,
        y: 0,
        power: 400,
    }));
    expect(() => validateToolpaths([path])).toThrow(/point budget/);
    expect(() => laserOvercutPoints(make().laserPaths[0].points, 1, 0)).toThrow(
        /point budget/,
    );
});
test('precision guard retains overcut in metric and inch profiles', () => {
    const path = make({ overcut: 0.01 });
    expect(() =>
        exportToolpaths([path], 'fine', false, 'metric', {
            ...DEFAULT_OUTPUT,
            decimals: 1,
        }),
    ).toThrow(/precision/);
    expect(() =>
        exportToolpaths([path], 'fine', false, 'imperial', {
            ...DEFAULT_OUTPUT,
            decimals: 3,
        }),
    ).toThrow(/precision/);
    expect(exportToolpaths([path], 'fine', false, 'metric')).toContain('X0.01');
});

test('overcut measures the actual kerf-adjusted contour', () => {
    const lengths = distances(code(make({ kerf: 0.2 })));
    expect(lengths[0]).toBeCloseTo(lengths[1], 8);
    expect(lengths[2] - lengths[1]).toBeCloseTo(2.5, 3);
});

test('legacy paths require regeneration instead of silently ignoring configured overcut', () => {
    const { laserPaths, ...legacy } = make();
    void laserPaths;
    expect(() => code(legacy as ReturnType<typeof make>)).toThrow(/Rebuild/);
});
