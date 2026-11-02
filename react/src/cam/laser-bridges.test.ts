import { manualLaserBridges } from './laser-bridges.js';
import { createLaserToolpath, laserOptions } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
const square = (x = 0, size = 20) => ({
    points: [
        { x, y: 0 },
        { x: x + size, y: 0 },
        { x: x + size, y: size },
        { x, y: size },
        { x, y: 0 },
    ],
});
const make = (options = {}, loops = [square()]) =>
    createLaserToolpath(
        loops,
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: {
                bridges: true,
                bridgeWidth: 1,
                bridgeCount: 4,
                ...options,
            },
        }),
    );
type Point = { x: number; y: number; power?: number };
type Path = { points: Point[] };
const offSegments = (path: Path): [Point, Point][] =>
    path.points
        .slice(1)
        .flatMap((b, i) => (b.power === 0 ? [[path.points[i], b]] : []));
const offLength = (path: Path) =>
    offSegments(path).reduce(
        (n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y),
        0,
    );
const gaps = (path: Path) =>
    offSegments(path)
        .map(([a, b]) =>
            [a, b]
                .map((p) => [p.x, p.y].join(','))
                .sort()
                .join(':'),
        )
        .sort();
test('four exact gaps, original artwork untouched, preview uses segment powers', () => {
    const loops = [square()],
        before = JSON.stringify(loops),
        result = make({}, loops);
    expect(JSON.stringify(loops)).toBe(before);
    expect(offLength(result.laserPaths[0])).toBeCloseTo(4, 10);
    expect(offSegments(result.laserPaths[0])).toHaveLength(4);
    expect(result.previewContours[0]._laserVariablePower).toBe(true);
    expect(result.previewContours[0]).toEqual(
        expect.arrayContaining([expect.objectContaining({ power: 0 })]),
    );
});
test('travel start rotation preserves physical gaps and closing segment power', () => {
    const loops = [square(100), square(0)];
    const ordered = make({ optimizeTravel: true }, loops),
        fixed = make({ optimizeTravel: false }, loops);
    expect(ordered.laserPaths.map(gaps).sort()).toEqual(
        fixed.laserPaths.map(gaps).sort(),
    );
    for (const path of ordered.laserPaths)
        expect(offLength(path)).toBeCloseTo(4, 10);
});
test('start rotation across the original seam keeps the exact powered and unpowered geometry', () => {
    const ring = square().points.slice(0, -1);
    const points = [...ring.slice(2), ...ring.slice(0, 2), ring[2]];
    const loops = [{ points }];
    const fixed = make(
        { optimizeTravel: false, bridgeCount: 2, bridgeWidth: 3 },
        loops,
    ).laserPaths[0];
    const rotated = make(
        { optimizeTravel: true, bridgeCount: 2, bridgeWidth: 3 },
        loops,
    ).laserPaths[0];
    expect(rotated.points[0]).not.toEqual(fixed.points[0]);
    expect(gaps(rotated)).toEqual(gaps(fixed));
    expect(offLength(rotated)).toBeCloseTo(6, 10);
    expect(rotated.points[0]).toEqual(
        rotated.points[rotated.points.length - 1],
    );
});
test('skip inner works independently of inner-first ordering; enabling holes bridges both', () => {
    const outer = square(),
        hole = {
            points: square(5, 5).points.map((p) => ({ ...p, y: p.y + 5 })),
        };
    for (const innerFirst of [true, false]) {
        const result = make({ innerFirst }, [outer, hole]);
        expect(result.laserPaths.map(offLength).sort()).toEqual([0, 4]);
    }
    expect(
        make({ bridgeSkipInner: false }, [outer, hole]).laserPaths.map(
            offLength,
        ),
    ).toEqual([4, 4]);
});
test('kerf-adjusted contours preserve requested uncut width and repeated-pass S0 output', () => {
    const result = make({ kerf: 0.2, passes: 3 });
    expect(offLength(result.laserPaths[0])).toBeCloseTo(4, 8);
    const code = buildGcode({
        toolpaths: [result],
        fileName: 'bridges',
        forcePolylineArcs: true,
    });
    expect(code.match(/Laser pass/g)).toHaveLength(3);
    expect(
        code
            .split('\n')
            .filter(
                (l) =>
                    l.startsWith('G1 ') &&
                    /[XY]/.test(l) &&
                    /S0(?: |$)/.test(l),
            ),
    ).toHaveLength(12);
    expect(code).not.toMatch(/M6|G[01] Z/);
});
test('disabled bridges retain legacy powered contours', () => {
    const result = make({ bridges: false });
    expect(result.laserPaths[0].points).toHaveLength(5);
    expect(offLength(result.laserPaths[0])).toBe(0);
    expect(result.previewContours[0]._laserVariablePower).toBeUndefined();
});
test('corner-spanning gaps retain exact length and zero duplicate points', () => {
    const result = make({ bridgeCount: 2, bridgeWidth: 3 });
    const path = result.laserPaths[0];
    expect(offLength(path)).toBeCloseTo(6, 10);
    expect(offSegments(path)).toHaveLength(4);
    for (let i = 1; i < path.points.length; i++)
        expect(
            Math.hypot(
                path.points[i].x - path.points[i - 1].x,
                path.points[i].y - path.points[i - 1].y,
            ),
        ).toBeGreaterThan(0);
});
test('reject open geometry, oversized bridges and invalid settings', () => {
    expect(() =>
        make({}, [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 20, y: 0 },
                ],
            },
        ]),
    ).toThrow(/closed/);
    expect(() => make({ bridgeWidth: 20 })).toThrow(/cover/);
    for (const options of [
        { bridges: 1 },
        { bridgeWidth: NaN },
        { bridgeWidth: 0 },
        { bridgeCount: 2.5 },
        { bridgeCount: 101 },
        { bridgeSkipInner: 0 },
    ])
        expect(() => laserOptions(options)).toThrow();
});
test('coarse metric and inch profiles cannot silently collapse bridges', () => {
    const result = make({ bridgeWidth: 0.01 });
    expect(() =>
        exportToolpaths([result], 'bridges', false, 'metric', {
            ...DEFAULT_OUTPUT,
            decimals: 1,
        }),
    ).toThrow(/precision/);
    expect(() =>
        exportToolpaths([result], 'bridges', false, 'imperial', {
            ...DEFAULT_OUTPUT,
            decimals: 3,
        }),
    ).toThrow(/precision/);
    expect(
        exportToolpaths([result], 'bridges', false, 'metric', DEFAULT_OUTPUT),
    ).toContain('S0');
});

test('spacing adapts to perimeter and maximum redistributes rather than clumping bridges', () => {
    const options = {
        bridgePlacement: 'spacing',
        bridgeSpacing: 15,
        bridgeWidth: 1,
    };
    const small = make(options).laserPaths[0];
    const large = make(options, [square(0, 40)]).laserPaths[0];
    expect(offLength(small)).toBeCloseTo(6, 9);
    expect(offLength(large)).toBeCloseTo(11, 9);
    const capped = make({ ...options, bridgeLimit: true, bridgeMax: 3 })
        .laserPaths[0];
    expect(offLength(capped)).toBeCloseTo(3, 9);
    expect(gaps(capped)).toEqual(gaps(make({ bridgeCount: 3 }).laserPaths[0]));
});
test('spacing rejects excessive output and overlap without silently changing settings', () => {
    expect(() =>
        make(
            {
                bridgePlacement: 'spacing',
                bridgeSpacing: 0.01,
                bridgeWidth: 0.001,
            },
            [square(0, 100)],
        ),
    ).toThrow(/Too many/);
    expect(() =>
        make({
            bridgePlacement: 'spacing',
            bridgeSpacing: 0.5,
            bridgeWidth: 1,
        }),
    ).toThrow(/cover/);
    for (const options of [
        { bridgeSpacing: 0 },
        { bridgeSpacing: NaN },
        { bridgeMax: 2.5 },
        { bridgeMax: 0 },
        { bridgePlacement: 'random' },
        { bridgeLimit: 1 },
    ])
        expect(() => laserOptions(options)).toThrow();
});
test('saved count-mode settings retain identical paths when spacing controls are unused', () => {
    expect(
        make({
            bridgePlacement: 'count',
            bridgeSpacing: 0.01,
            bridgeLimit: true,
            bridgeMax: 1,
        }).laserPaths,
    ).toEqual(make().laserPaths);
});

test('spacing respects the global point/pass budget before allocating bridge boundaries', () => {
    expect(() =>
        make(
            {
                passes: 100,
                bridgePlacement: 'spacing',
                bridgeSpacing: 0.02,
                bridgeWidth: 0.001,
            },
            [square(0, 50)],
        ),
    ).toThrow(/reduce bridges or passes/);
});

test('manual bridges wrap the seam, merge overlap, preserve existing gaps and leave source points untouched', () => {
    const source = [
        { points: square().points.map((p) => ({ ...p, power: 400 })) },
    ];
    const before = JSON.stringify(source);
    const one = manualLaserBridges(source, [{ contourIndex: 0, along: 0 }], 2);
    expect(offLength(one[0])).toBeCloseTo(2, 8);
    expect(one[0].points[0].power).toBe(0);
    const overlap = manualLaserBridges(
        source,
        [
            { contourIndex: 0, along: 10 },
            { contourIndex: 0, along: 11 },
            { contourIndex: 0, along: 10 },
        ],
        2,
    );
    expect(offLength(overlap[0])).toBeCloseTo(3, 8);
    const combined = manualLaserBridges(
        one,
        [{ contourIndex: 0, along: 40 }],
        2,
    );
    expect(offLength(combined[0])).toBeCloseTo(4, 8);
    expect(JSON.stringify(source)).toBe(before);
});

test('manual positions are interpreted on the final ordered cut and repeat as S0 without Z', () => {
    const config = makeToolpathConfig({
        operation: 'laser-cut',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 400,
        laserOptions: { bridgeWidth: 2, passes: 2 },
        laserManualTabs: [{ contourIndex: 0, along: 10 }],
    });
    const result = createLaserToolpath([square()], config);
    expect(offLength(result.laserPaths[0])).toBeCloseTo(2, 8);
    expect(result.previewContours[0]._laserVariablePower).toBe(true);
    const code = exportToolpaths(
        [{ ...result, spindle: 0, safeZ: 5 }],
        'manual',
        false,
        'metric',
        DEFAULT_OUTPUT,
    );
    expect(code).toContain('S400');
    expect(code.match(/G1 [^\n]*[XY][^\n]*S0/g)).toHaveLength(2);
    expect(code).not.toMatch(/G[01] Z/);
    expect(() =>
        exportToolpaths([result], 'manual', false, 'metric', {
            ...DEFAULT_OUTPUT,
            decimals: 0,
        }),
    ).toThrow(/precision/);
});

test.each([
    [{ contourIndex: -1, along: 0 }],
    [{ contourIndex: 1, along: 0 }],
    [{ contourIndex: 0, along: -1 }],
    [{ contourIndex: 0, along: NaN }],
    [{ contourIndex: 0, along: 81 }],
])('rejects invalid manual bridge positions %p', (tabs) => {
    expect(() => manualLaserBridges([square()], tabs, 1)).toThrow(/bridge/i);
});

test('manual bridges reject open contours, complete coverage and point overflow', () => {
    expect(() =>
        manualLaserBridges(
            [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 5, y: 0 },
                    ],
                },
            ],
            [{ contourIndex: 0, along: 2 }],
            1,
        ),
    ).toThrow(/closed/);
    expect(() =>
        manualLaserBridges(
            [square()],
            [
                { contourIndex: 0, along: 20 },
                { contourIndex: 0, along: 60 },
            ],
            40,
        ),
    ).toThrow(/cover/);
    expect(() =>
        manualLaserBridges([square()], [{ contourIndex: 0, along: 10 }], 1, 5),
    ).toThrow(/large/);
});

test('manual bridge anchors survive route changes and reject changed geometry', () => {
    const run = (optimizeTravel: boolean, kerf = 0) =>
        createLaserToolpath(
            [square(100), square()],
            makeToolpathConfig({
                operation: 'laser-cut',
                toolDiameter: 1,
                cutDepth: 1,
                laserPower: 400,
                laserOptions: { optimizeTravel, kerf, bridgeWidth: 2 },
                laserManualTabs: [
                    { contourIndex: 0, along: 10, anchor: { x: 110, y: 0 } },
                ],
            }),
        );
    const fixed = run(false),
        reordered = run(true);
    expect(fixed.laserPaths.flatMap(offSegments)).toEqual(
        reordered.laserPaths.flatMap(offSegments),
    );
    expect(fixed.laserManualTabs[0].contourIndex).not.toBe(
        reordered.laserManualTabs[0].contourIndex,
    );
    expect(() => run(true, 1)).toThrow(/no longer matches/);
});

test('one bridge switch preserves manual positions while disabling and switching generation modes', () => {
    const tabs = [{ contourIndex: 0, along: 10, anchor: { x: 10, y: 0 } }];
    const run = (bridges: boolean, bridgeMode: 'automatic' | 'manual') =>
        createLaserToolpath(
            [square()],
            makeToolpathConfig({
                operation: 'laser-cut',
                toolDiameter: 1,
                cutDepth: 1,
                laserPower: 400,
                laserOptions: {
                    bridges,
                    bridgeMode,
                    bridgeWidth: 2,
                    bridgeCount: 4,
                },
                laserManualTabs: tabs,
            }),
        );
    const manual = run(true, 'manual'),
        off = run(false, 'manual'),
        auto = run(true, 'automatic');
    expect(offLength(manual.laserPaths[0])).toBeCloseTo(2, 8);
    expect(offLength(off.laserPaths[0])).toBe(0);
    expect(offLength(auto.laserPaths[0])).toBeCloseTo(8, 8);
    expect(off.laserManualTabs).toEqual(tabs);
    expect(auto.laserManualTabs).toEqual(tabs);
    expect(run(true, 'manual').laserPaths).toEqual(manual.laserPaths);
    expect(() => laserOptions({ bridgeMode: 'both' })).toThrow(/bridge/i);
});
