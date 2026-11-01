import {
    laserLeadEndpoints,
    validateLaserLeadClearance,
} from './laser-leads.js';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
import { validateToolpaths } from './gcode-validation.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
const ring = (x = 0, y = 0, size = 10) => [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
    { x, y },
];
const make = (options = {}, loops = [{ points: ring() }]) =>
    createLaserToolpath(
        loops,
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserPower: 400,
            laserFeed: 1200,
            laserOptions: {
                leadInLength: 1,
                leadOutLength: 1,
                leadInAngle: 45,
                leadOutAngle: 45,
                passes: 2,
                optimizeTravel: false,
                ...options,
            },
        }),
    );
const program = (path: ReturnType<typeof make>) =>
    buildGcode({
        toolpaths: [path],
        fileName: 'leads',
        forcePolylineArcs: true,
    });
test('closed outer and cutout leads aim at opposite material sides irrespective of winding', () => {
    for (const reverse of [false, true]) {
        const inner = ring(3, 3, 3),
            outer = ring();
        const path = make({}, [
            { points: reverse ? outer.slice().reverse() : outer },
            { points: reverse ? inner.slice().reverse() : inner },
        ]);
        const hole = path.laserPaths.find((p) => p.laserLeadInside),
            outside = path.laserPaths.find((p) => !p.laserLeadInside);
        expect(hole).toBeDefined();
        expect(outside).toBeDefined();
        const cutout = laserLeadEndpoints(hole, path.laserOptions, 400),
            solid = laserLeadEndpoints(outside, path.laserOptions, 400);
        for (const point of [cutout.entry!, cutout.exit!]) {
            expect(point.x).toBeGreaterThan(3);
            expect(point.y).toBeGreaterThan(3);
            expect(point.x).toBeLessThan(6);
            expect(point.y).toBeLessThan(6);
        }
        expect(solid.entry!.x < 0 || solid.entry!.y < 0).toBe(true);
        expect(solid.exit!.x < 0 || solid.exit!.y < 0).toBe(true);
    }
});
test('nested islands get exterior leads even with inner-first disabled', () => {
    const path = make({ innerFirst: false }, [
        { points: ring(0, 0, 30) },
        { points: ring(5, 5, 20) },
        { points: ring(10, 10, 3) },
    ]);
    expect(path.laserPaths.map((p) => p.laserLeadInside)).toEqual([
        false,
        true,
        false,
    ]);
});
test('open leads respect start/end directions and carry the requested physical length', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ];
    const path = make({ leadInLength: 2, leadOutLength: 3 }, [{ points }]),
        leads = laserLeadEndpoints(path.laserPaths[0], path.laserOptions, 400);
    expect(Math.hypot(leads.entry!.x, leads.entry!.y)).toBeCloseTo(2, 10);
    expect(leads.entry!.x).toBeLessThan(0);
    expect(leads.entry!.y).toBeGreaterThan(0);
    expect(Math.hypot(leads.exit!.x - 10, leads.exit!.y)).toBeCloseTo(3, 10);
});
test('emission has powered entry/exit each pass, and final exit follows overcut', () => {
    const path = make({ overcut: 2, leadInAngle: 0, leadOutAngle: 0 }),
        before = JSON.stringify(path.laserPaths),
        output = program(path);
    expect(output.match(/G0 X-1 Y0/g)).toHaveLength(2);
    expect(output).toContain('G1 X0 S400 F1200');
    expect(output).toContain('G1 Y-1 S400');
    expect(output).toContain('G1 X3 S400');
    expect(JSON.stringify(path.laserPaths)).toBe(before);
    expect(path.previewContours.length).toBe(4);
    expect(output).not.toMatch(/M6|G[01] Z/);
});
test('perforation powers inside the contour stay unchanged while entry is powered', () => {
    const path = make({
        perforation: true,
        perforationCut: 3,
        perforationSkip: 2,
    });
    expect(path.laserPaths[0].points.some((p) => p.power === 0)).toBe(true);
    expect(program(path)).toContain('S0');
    expect(path.previewContours).toHaveLength(3);
});
test('disabled leads keep legacy paths without new topology metadata', () => {
    const path = make({ leadInLength: 0, leadOutLength: 0 });
    expect(path.laserPaths[0].laserLeadInside).toBeUndefined();
    expect(path.previewContours).toHaveLength(1);
    expect(program(path).match(/G0 X0 Y0/g)).toHaveLength(2);
});
test('malformed saved lead settings and missing topology require correction before export', () => {
    const path = make();
    delete path.laserPaths[0].laserLeadInside;
    expect(() => validateToolpaths([path])).toThrow(/Rebuild/);
    for (const value of [-1, NaN, 10001]) {
        const bad = make();
        bad.laserOptions.leadInLength = value;
        expect(() => program(bad)).toThrow(/lead/);
    }
    const tiny = make({ leadInLength: 0.001, leadOutLength: 0 });
    expect(() =>
        exportToolpaths([tiny], 'fine', false, 'imperial', {
            ...DEFAULT_OUTPUT,
            decimals: 3,
        }),
    ).toThrow(/precision/);
});

test('closed-boundary collisions and concave wrong-side leads are rejected', () => {
    expect(() =>
        program(
            make({ leadInLength: 5, leadOutLength: 0 }, [
                { points: ring() },
                { points: ring(-3, -3, 2) },
            ]),
        ),
    ).toThrow(/crosses/);
    const shape = [
        [0, 0],
        [10, 0],
        [10, 10],
        [6, 10],
        [6, 3],
        [4, 3],
        [4, 10],
        [0, 10],
    ].map(([x, y]) => ({ x, y }));
    const points = [...shape.slice(4), ...shape.slice(0, 4), shape[4]];
    expect(() => program(make({ leadOutLength: 0 }, [{ points }]))).toThrow(
        /wrong side|crosses/,
    );
});

test('leads join powered runs without removing perforation gaps', () => {
    const path = make({
        perforation: true,
        perforationCut: 3,
        perforationSkip: 2,
    });
    const points = path.laserPaths[0].points;
    expect(points[0].power).toBeGreaterThan(0);
    expect(points[1].power).toBeGreaterThan(0);
    let skipped = 0;
    for (let i = 1; i < points.length; i++)
        if (points[i].power === 0)
            skipped += Math.hypot(
                points[i].x - points[i - 1].x,
                points[i].y - points[i - 1].y,
            );
    expect(skipped).toBeCloseTo(16, 8);
    expect(() => program(path)).not.toThrow();
    const bad = make({
        perforation: true,
        perforationCut: 3,
        perforationSkip: 2,
        overcut: 2,
    });
    expect(() => program(bad)).toThrow(/uncut gap/);
});
test('duplicate enclosing outlines do not change hole lead side', () => {
    const path = make({}, [
        { points: ring() },
        { points: ring() },
        { points: ring(3, 3, 3) },
    ]);
    expect(
        path.laserPaths.find((p) => p.points.every((v) => v.x >= 3 && v.x <= 6))
            ?.laserLeadInside,
    ).toBe(true);
});

test('collinear contact with another outline is rejected but separated segments are allowed', () => {
    const source = {
        points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ],
    };
    const options = { leadInLength: 2, leadOutLength: 0, leadInAngle: 0 };
    expect(() =>
        validateLaserLeadClearance(
            [source, { points: ring(-3, 0, 2) }],
            options,
            400,
        ),
    ).toThrow(/overlaps/);
    expect(() =>
        validateLaserLeadClearance(
            [source, { points: ring(-4, 0, 2) }],
            options,
            400,
        ),
    ).toThrow(/overlaps|crosses/);
    expect(() =>
        validateLaserLeadClearance(
            [source, { points: ring(-5, 0, 2) }],
            options,
            400,
        ),
    ).not.toThrow();
    expect(() =>
        validateLaserLeadClearance(
            [source, { points: ring(-3, 0.001, 2) }],
            options,
            400,
        ),
    ).not.toThrow();
});
test('open perforated terminal gaps do not become powered lead attachments', () => {
    const path = make(
        { perforation: true, perforationCut: 3, perforationSkip: 2 },
        [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 9, y: 0 },
                ],
            },
        ],
    );
    const points = path.laserPaths[0].points;
    expect(points[points.length - 1].x).toBe(8);
    expect(points[points.length - 1].power).toBe(400);
    expect(() => program(path)).not.toThrow();
});
