import { perforateLaserContour } from './laser-perforation.js';
import { createLaserToolpath, laserOptions } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
type Point = { x: number; y: number; power?: number };
const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
];
const ring = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];
const make = (points: Point[] = line, options = {}) =>
    createLaserToolpath(
        [{ points }],
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: {
                perforation: true,
                perforationCut: 3,
                perforationSkip: 2,
                ...options,
            },
        }),
    );
const lengths = (points: Point[]) =>
    points.slice(1).reduce(
        (sum, b, i) => {
            sum[b.power === 0 ? 'off' : 'on'] += Math.hypot(
                b.x - points[i].x,
                b.y - points[i].y,
            );
            return sum;
        },
        { on: 0, off: 0 },
    );
const geometry = (points: Point[]) =>
    points
        .slice(1)
        .map(
            (b, i) =>
                [points[i], b]
                    .map((p) => `${p.x},${p.y}`)
                    .sort()
                    .join(':') + `:${b.power}`,
        )
        .sort();
test('cut/skip phase continues across vertices and handles a partial final interval', () => {
    const result = perforateLaserContour(
        [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 6 },
        ],
        3,
        2,
    );
    expect(lengths(result)).toEqual({ on: 6, off: 4 });
    expect(result).toEqual(
        expect.arrayContaining([
            { x: 4, y: 0, power: 0 },
            { x: 4, y: 1, power: 0 },
            { x: 4, y: 4, power: 1 },
        ]),
    );
    expect(
        lengths(
            perforateLaserContour(
                [
                    { x: 0, y: 0 },
                    { x: 9, y: 0 },
                ],
                3,
                2,
            ),
        ),
    ).toEqual({ on: 6, off: 3 });
});
test('closed seam and optimized start retain the same physical perforations', () => {
    const points = [...ring.slice(2, -1), ...ring.slice(0, 2), ring[2]];
    const fixed = make(points, { optimizeTravel: false }).laserPaths[0].points;
    const ordered = make(points, { optimizeTravel: true }).laserPaths[0].points;
    expect(ordered[0]).not.toEqual(fixed[0]);
    expect(geometry(ordered)).toEqual(geometry(fixed));
    expect(lengths(ordered)).toEqual({ on: 48, off: 32 });
});
test('reversing an open path preserves segment-ending power including an off final segment', () => {
    const points = [
        { x: 10, y: 0 },
        { x: 0, y: 0 },
    ];
    const ordered = make(points).laserPaths[0].points;
    const fixed = make(points, { optimizeTravel: false }).laserPaths[0].points;
    expect(ordered[0].x).toBe(0);
    expect(geometry(ordered)).toEqual(geometry(fixed));
    expect(lengths(ordered)).toEqual({ on: 6, off: 4 });
});
test('holding bridges remain unpowered during perforation and artwork stays unchanged', () => {
    const before = JSON.stringify(ring);
    const bridged = make(ring, {
        bridges: true,
        bridgeWidth: 1,
        bridgeCount: 4,
    });
    expect(JSON.stringify(ring)).toBe(before);
    const points = bridged.laserPaths[0].points;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
            b = points[i],
            x = (a.x + b.x) / 2,
            y = (a.y + b.y) / 2;
        if (
            (Math.abs(x - 10) < 0.5 && (y === 0 || y === 20)) ||
            (Math.abs(y - 10) < 0.5 && (x === 0 || x === 20))
        )
            expect(b.power).toBe(0);
    }
    expect(bridged.previewContours[0]._laserVariablePower).toBe(true);
});
test('multi-pass export repeats exact S0 perforations without Z or tool changes', () => {
    const path = make(line, { passes: 2 });
    const code = exportToolpaths(
        [path],
        'perforation',
        false,
        'metric',
        DEFAULT_OUTPUT,
    );
    expect(code.match(/Laser pass/g)).toHaveLength(2);
    expect(
        code
            .split('\n')
            .filter(
                (l) => /^G1 /.test(l) && /[XY]/.test(l) && /S0(?: |$)/.test(l),
            ),
    ).toHaveLength(4);
    expect(code).toContain('S400');
    expect(code).not.toMatch(/M6|G[01] Z/);
});
test('disabled perforation leaves ordinary geometry and preview unchanged', () => {
    const path = make(line, { perforation: false });
    expect(path.laserPaths[0].points).toEqual(
        line.map((p) => ({ ...p, power: 400 })),
    );
    expect(path.previewContours[0]._laserVariablePower).toBeUndefined();
});
test('precision guards metric/inch output, and point budgets reject dense jobs before allocation', () => {
    const path = make(line, { perforationCut: 0.01, perforationSkip: 0.01 });
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
    expect(() => perforateLaserContour(line, 0.01, 0.01, 100)).toThrow(
        /too dense/,
    );
    expect(() =>
        make(line, {
            passes: 100,
            perforationCut: 0.001,
            perforationSkip: 0.001,
        }),
    ).not.toThrow();
    expect(() =>
        make(
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            { passes: 100, perforationCut: 0.001, perforationSkip: 0.001 },
        ),
    ).toThrow(/too dense/);
    for (const options of [
        { perforation: 1 },
        { perforationCut: 0 },
        { perforationSkip: NaN },
        { perforationSkip: -1 },
    ])
        expect(() => laserOptions(options)).toThrow();
});
