import { createLaserToolpath, hatchPaths, laserOptions } from './laser.js';
import { buildGcode } from './gcode/program.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { rasterSegments } from './fixtures/laser-raster-cases.js';
const square = (x = 0, y = 0, size = 10) => [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
    { x, y },
];
const config = (extra = {}) =>
    makeToolpathConfig({
        operation: 'laser-cut',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 250,
        laserSpot: 1,
        ...extra,
    });
function image(data: number[], extra = {}) {
    return createLaserToolpath(
        [{ points: square() }],
        config({
            operation: 'laser-raster',
            laserSpot: 1,
            laserOverscan: 2,
            ...extra,
        }),
        {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 },
                    _imageData: { width: 2, height: 1, data },
                },
            ],
        },
    );
}
test('line power preview and repeated output agree, with no tool change or Z motion', () => {
    const p = createLaserToolpath(
        [{ points: square() }],
        config({ laserOptions: { passes: 3, airAssist: true } }),
    );
    expect(p.previewContours[0]._intensity).toBe(0.25);
    const code = buildGcode({
        toolpaths: [p],
        fileName: 'laser',
        forcePolylineArcs: true,
    });
    expect(code.match(/Laser pass/g)).toHaveLength(3);
    expect(code).toContain('S250 F1200');
    expect(code).toContain('M8');
    expect(code).toContain('M9');
    expect(code).not.toMatch(/M6|G[01] Z/);
});
test('exact hatch intersections exclude holes at arbitrary scan angles', () => {
    for (const angle of [0, 15, 45, 90]) {
        const paths = hatchPaths([square(), square(3, 3, 4)], 0.5, angle);
        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) {
            const a = path[0],
                b = path[1];
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            expect(
                m.x > 3.00001 &&
                    m.x < 6.99999 &&
                    m.y > 3.00001 &&
                    m.y < 6.99999,
            ).toBe(false);
        }
    }
});
test('fill handles holes and keeps sub-millimetre shapes', () => {
    const fill = createLaserToolpath(
        [{ points: square() }, { points: square(3, 3, 4) }],
        config({ operation: 'laser-fill' }),
    );
    let poweredSegments = 0;
    for (const path of fill.laserPaths) {
        for (let i = 1; i < path.points.length; i++) {
            const a = path.points[i - 1],
                b = path.points[i];
            if (!(b.power > 0)) continue;
            poweredSegments++;
            const x = (a.x + b.x) / 2,
                y = (a.y + b.y) / 2;
            expect(x > 3 && x < 7 && y > 3 && y < 7).toBe(false);
        }
    }
    expect(poweredSegments).toBeGreaterThan(10);
    const tiny = createLaserToolpath(
        [{ points: square(0, 0, 0.5) }],
        config({ operation: 'laser-fill', laserSpot: 0.1 }),
    );
    expect(tiny.laserPaths.length).toBeGreaterThan(0);
});
test('kerf expands outside and shrinks hole without changing source points', () => {
    const loops = [{ points: square() }, { points: square(3, 3, 4) }],
        before = JSON.stringify(loops);
    const result = createLaserToolpath(
        loops,
        config({ laserOptions: { kerf: 0.2 } }),
    );
    const bounds = result.laserPaths
        .map((p) => ({
            min: Math.min(...p.points.map((v) => v.x)),
            max: Math.max(...p.points.map((v) => v.x)),
        }))
        .sort((a, b) => a.min - b.min);
    expect(bounds[0].min).toBeCloseTo(-0.1);
    expect(bounds[0].max).toBeCloseTo(10.1);
    expect(bounds[1].min).toBeCloseTo(3.1);
    expect(JSON.stringify(loops)).toBe(before);
});
test('open geometry cannot silently be filled or kerf-offset', () => {
    expect(() =>
        createLaserToolpath(
            [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 5, y: 5 },
                    ],
                },
            ],
            config({ operation: 'laser-fill' }),
        ),
    ).toThrow('closed');
});
test('raster preview uses final gamma and S range, completes whole cells, and turns off overscan', () => {
    const p = image([0, 0, 0, 255, 255, 255, 255, 255], {
        laserSMax: 400,
        laserOptions: { trimBlank: false },
    });
    expect(p.previewContours).toHaveLength(1);
    expect(rasterSegments(p.previewContours)[0]._laserPower).toBe(0.4);
    expect(p.laserPaths[0].points.map((p) => p.power)).toEqual([
        0, 0, 400, 0, 0,
    ]);
    expect(p.laserPaths[0].points[p.laserPaths[0].points.length - 1].x).toBe(4);
});
test.each(['grayscale', 'threshold', 'ordered', 'floyd-steinberg'])(
    'transparent pixels stay off in %s',
    (mode) => {
        const p = image([0, 0, 0, 0, 0, 0, 0, 255], {
            laserOptions: { imageMode: mode, invert: true, trimBlank: false },
            laserSMin: 100,
        });
        expect(p.laserPaths[0].points[2].power).toBe(0);
    },
);
test('invalid options and impractically dense jobs fail before emission', () => {
    expect(() => laserOptions({ passes: 1.5 })).toThrow('whole');
    expect(() => laserOptions({ kerf: NaN })).toThrow('kerf');
    expect(() =>
        image([0, 0, 0, 255, 0, 0, 0, 255], { laserSpot: 0.00001 }),
    ).toThrow('million');
});

test('blank ends trim to powered cells while overscan stays off', () => {
    const result = createLaserToolpath(
        [],
        config({
            operation: 'laser-raster',
            laserSMax: 1000,
            laserOverscan: 2,
            laserSpot: 1,
        }),
        {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 1 },
                    _imageData: {
                        width: 4,
                        height: 1,
                        data: [
                            255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255,
                            255, 255, 255,
                        ],
                    },
                },
            ],
        },
    );
    expect(result.laserPaths[0].points).toEqual([
        { x: -1, y: 0.5, power: 0 },
        { x: 1, y: 0.5, power: 0 },
        { x: 3, y: 0.5, power: 1000 },
        { x: 5, y: 0.5, power: 0 },
    ]);
});
test.each([0, 45, 90, 135])(
    'scan angle %s stays inside image without overscan',
    (angle) => {
        const result = createLaserToolpath(
            [],
            config({
                operation: 'laser-raster',
                laserSpot: 0.2,
                laserOverscan: 0,
                laserOptions: { scanAngle: angle },
            }),
            {
                sourceEntities: [
                    {
                        type: 'BITMAP',
                        bounds: { minX: 10, minY: 20, maxX: 14, maxY: 22 },
                        _imageData: {
                            width: 1,
                            height: 1,
                            data: [0, 0, 0, 255],
                        },
                    },
                ],
            },
        );
        expect(result.laserPaths.length).toBeGreaterThan(0);
        for (const path of result.laserPaths)
            for (const p of path.points) {
                expect(p.x).toBeGreaterThanOrEqual(10 - 1e-7);
                expect(p.x).toBeLessThanOrEqual(14 + 1e-7);
                expect(p.y).toBeGreaterThanOrEqual(20 - 1e-7);
                expect(p.y).toBeLessThanOrEqual(22 + 1e-7);
            }
        const powered = result.laserPaths[0].points;
        expect(
            (Math.atan2(
                powered[1].y - powered[0].y,
                powered[1].x - powered[0].x,
            ) *
                180) /
                Math.PI,
        ).toBeCloseTo(angle);
    },
);
test.each(['atkinson', 'jarvis', 'stucki'])(
    '%s produces binary power and keeps transparent pixels off',
    (mode) => {
        const result = image([128, 128, 128, 255, 0, 0, 0, 0], {
            laserOptions: { imageMode: mode, trimBlank: false },
            laserSMax: 1000,
        });
        const powers = result.laserPaths.flatMap((p) =>
            p.points.map((v) => v.power),
        );
        expect(powers.every((p) => p === 0 || p === 1000)).toBe(true);
        expect(
            result.laserPaths[0].points[result.laserPaths[0].points.length - 1]
                .power,
        ).toBe(0);
    },
);

const unitRect = (left = 0, bottom = 0, right = 1, top = 1) => [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: right, y: top },
    { x: left, y: top },
    { x: left, y: bottom },
];
function blackRegion(options = {}, rotation = 0) {
    return createLaserToolpath(
        [],
        config({
            operation: 'laser-raster',
            laserSpot: 0.1,
            laserOverscan: 1,
            laserSMax: 1000,
            laserOptions: options,
        }),
        {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    rotation,
                    bounds: { minX: 10, minY: 20, maxX: 20, maxY: 30 },
                    _imageData: { width: 1, height: 1, data: [0, 0, 0, 255] },
                },
            ],
        },
    );
}
test.each([0, 45, 90])(
    'crop and holed masks clip every powered segment at scan angle %s',
    (scanAngle) => {
        const crop = { left: 0.1, bottom: 0.2, right: 0.9, top: 0.8 };
        const p = blackRegion({
            imageCrop: crop,
            imageMask: [unitRect(), unitRect(0.4, 0.4, 0.6, 0.6)],
            scanAngle,
        });
        expect(p.previewContours.length).toBeGreaterThan(0);
        for (const segment of rasterSegments(p.previewContours)) {
            for (const v of segment) {
                expect(v.x).toBeGreaterThanOrEqual(11 - 1e-7);
                expect(v.x).toBeLessThanOrEqual(19 + 1e-7);
                expect(v.y).toBeGreaterThanOrEqual(22 - 1e-7);
                expect(v.y).toBeLessThanOrEqual(28 + 1e-7);
            }
            const x = (segment[0].x + segment[1].x) / 2,
                y = (segment[0].y + segment[1].y) / 2;
            expect(
                x > 14 + 1e-7 &&
                    x < 16 - 1e-7 &&
                    y > 24 + 1e-7 &&
                    y < 26 - 1e-7,
            ).toBe(false);
        }
    },
);
test('normalized crop follows bitmap rotation and does not mutate source options', () => {
    const options = { imageCrop: { left: 0, bottom: 0, right: 0.5, top: 1 } },
        before = JSON.stringify(options);
    const p = blackRegion(options, 90);
    for (const line of rasterSegments(p.previewContours))
        for (const v of line) expect(v.y).toBeLessThanOrEqual(25 + 1e-7);
    expect(JSON.stringify(options)).toBe(before);
});
test('non-overlapping mask emits no powered lines, and invalid regions fail clearly', () => {
    expect(
        blackRegion({ imageMask: [unitRect(2, 2, 3, 3)] }).previewContours,
    ).toHaveLength(0);
    expect(() =>
        laserOptions({
            imageCrop: { left: 0.9, bottom: 0, right: 0.1, top: 1 },
        }),
    ).toThrow('crop');
    expect(() =>
        laserOptions({
            imageMask: [
                [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                ],
            ],
        }),
    ).toThrow('closed');
    expect(() =>
        laserOptions({
            imageMask: [unitRect().map((p) => ({ ...p, x: Infinity }))],
        }),
    ).toThrow('finite');
});

test('shade reduction quantizes mapped darkness without changing source data', () => {
    const data = [40, 40, 40, 255, 200, 200, 200, 255];
    const original = [...data];
    const result = image(data, {
        laserOptions: {
            imageMode: 'grayscale',
            shadeCount: 4,
            trimBlank: false,
        },
        laserSMin: 0,
        laserSMax: 1000,
        laserOverscan: 0,
    });
    expect(result.laserPaths[0].points.slice(1).map((p) => p.power)).toEqual([
        1000, 333,
    ]);
    expect(data).toEqual(original);
});
test('selected grayscale channel reaches the raster power mapping', () => {
    const result = image([255, 0, 0, 255, 255, 0, 0, 255], {
        laserOptions: {
            imageMode: 'grayscale',
            grayscale: 'red',
            trimBlank: false,
        },
        laserOverscan: 0,
    });
    expect(
        result.laserPaths.every((p) => p.points.every((v) => v.power === 0)),
    ).toBe(true);
    expect(() => laserOptions({ shadeCount: 1 })).toThrow(/shade/);
    expect(() => laserOptions({ shadeCount: 3.5 })).toThrow(/shade/);
});
