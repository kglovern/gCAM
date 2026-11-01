import { laserJobBounds } from './laser-bounds';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
import { rasterCases, rasterRequest } from './fixtures/laser-raster-cases.js';
const path = (points: { x: number; y: number; power: number }[]) => ({
    operation: 'laser-raster',
    laserPaths: [{ points }],
    laserOptions: { passes: 1 },
});

test('separates S0 overscan from both endpoints of each powered move', () => {
    expect(
        laserJobBounds([
            path([
                { x: -5, y: 3, power: 0 },
                { x: 0, y: 3, power: 0 },
                { x: 10, y: 3, power: 400 },
                { x: 15, y: 3, power: 0 },
            ]),
        ]),
    ).toEqual({
        travel: { minX: -5, minY: 3, maxX: 15, maxY: 3 },
        powered: { minX: 0, minY: 3, maxX: 10, maxY: 3 },
    });
});
test('all-white paths, sub-integer rounded-off power and non-laser jobs have no powered area', () => {
    const p = path([
        { x: 0, y: 0, power: 100 },
        { x: 20, y: 10, power: 0.1 },
    ]);
    expect(laserJobBounds([p]).powered).toBeNull();
    expect(laserJobBounds([{ ...p, operation: 'profile-outside' }])).toEqual({
        travel: null,
        powered: null,
    });
});
test('rejects invalid coordinates and skips single-point paths like the emitter', () => {
    expect(() =>
        laserJobBounds([
            path([
                { x: NaN, y: 0, power: 0 },
                { x: 1, y: 1, power: 1 },
            ]),
        ]),
    ).toThrow('coordinates');
    expect(laserJobBounds([path([{ x: 10, y: 10, power: 400 }])])).toEqual({
        travel: null,
        powered: null,
    });
});

function emittedBounds(code: string) {
    const points: { x: number; y: number; power: number }[][] = [];
    let current: { x: number; y: number; power: number }[] | null = null,
        x = 0,
        y = 0,
        power = 0;
    for (const raw of code.split('\n')) {
        const line = raw.replace(/\([^)]*\)/g, '');
        const s = line.match(/\bS([-+\d.]+)/);
        if (s) power = Number(s[1]);
        const mx = line.match(/\bX([-+\d.]+)/),
            my = line.match(/\bY([-+\d.]+)/);
        if (!mx && !my) continue;
        if (mx) x = Number(mx[1]);
        if (my) y = Number(my[1]);
        if (/\bG0\b/.test(line)) {
            current = [{ x, y, power: 0 }];
            points.push(current);
        } else current?.push({ x, y, power });
    }
    return laserJobBounds([
        {
            operation: 'laser-raster',
            laserPaths: points.map((points) => ({ points })),
        },
    ]);
}

test.each([1, 2])(
    'matches emitted moves including lead exit changes on final overcut, %i passes',
    (passes) => {
        const points = [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
            { x: 10, y: 30 },
            { x: 10, y: 10 },
        ];
        const job = createLaserToolpath(
            [{ points }],
            makeToolpathConfig({
                operation: 'laser-cut',
                toolDiameter: 1,
                cutDepth: 1,
                laserPower: 400,
                laserFeed: 1200,
                laserOptions: {
                    passes,
                    leadInLength: 2,
                    leadOutLength: 3,
                    leadInAngle: 45,
                    leadOutAngle: 45,
                    overcut: 5,
                    optimizeTravel: false,
                },
            }),
        );
        const actual = emittedBounds(
            buildGcode({
                toolpaths: [job],
                fileName: 'bounds',
                forcePolylineArcs: true,
            }),
        );
        const planned = laserJobBounds([job]);
        for (const key of ['travel', 'powered'] as const)
            for (const axis of ['minX', 'minY', 'maxX', 'maxY'] as const)
                expect(planned[key]![axis]).toBeCloseTo(actual[key]![axis], 3);
    },
);

test('matches emitted rotated raster overscan and alignment extrema', () => {
    for (const fixture of rasterCases
        .filter((x) => [0, 45, 90].includes(x.angle))
        .slice(0, 6)) {
        const { config, options } = rasterRequest(fixture);
        const job = createLaserToolpath([], config, options);
        const actual = emittedBounds(
            buildGcode({
                toolpaths: [job],
                fileName: 'raster',
                forcePolylineArcs: true,
            }),
        );
        const planned = laserJobBounds([job]);
        for (const key of ['travel', 'powered'] as const)
            for (const axis of ['minX', 'minY', 'maxX', 'maxY'] as const)
                expect(planned[key]![axis]).toBeCloseTo(actual[key]![axis], 3);
    }
});
