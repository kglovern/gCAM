import {
    scanAlignmentOffset,
    validateScanAlignment,
} from './scan-alignment.js';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
const calibration = {
    enabled: true,
    measurements: [
        { feed: 3000, gap: 0.6 },
        { feed: 1000, gap: 0.2 },
    ],
};

test('scan alignment halves measured separation and interpolates only within calibrated speeds', () => {
    expect(scanAlignmentOffset(calibration, 1000)).toBeCloseTo(0.1);
    expect(scanAlignmentOffset(calibration, 2000)).toBeCloseTo(0.2);
    expect(scanAlignmentOffset(calibration, 3000)).toBeCloseTo(0.3);
    expect(
        scanAlignmentOffset(
            {
                ...calibration,
                measurements: calibration.measurements.map((p) => ({
                    ...p,
                    gap: -p.gap,
                })),
            },
            2000,
        ),
    ).toBeCloseTo(-0.2);
    expect(() => scanAlignmentOffset(calibration, 500)).toThrow('outside');
    expect(() => scanAlignmentOffset(calibration, 4000)).toThrow('outside');
    expect(scanAlignmentOffset({ ...calibration, enabled: false }, 4000)).toBe(
        0,
    );
    expect(() =>
        validateScanAlignment({
            enabled: true,
            measurements: [{ feed: 1, gap: 0 }],
        }),
    ).toThrow('two');
    expect(() =>
        validateScanAlignment({
            enabled: true,
            measurements: [
                { feed: 1, gap: 0 },
                { feed: 1, gap: 0 },
            ],
        }),
    ).toThrow('different');
    for (const gap of [NaN, Infinity, 21])
        expect(() =>
            validateScanAlignment({
                enabled: false,
                measurements: [{ feed: 1, gap }],
            }),
        ).toThrow('measured gaps');
});

const options = (rotation: number) => ({
    sourceEntities: [
        {
            type: 'BITMAP',
            rotation,
            bounds: { minX: 10, minY: 20, maxX: 20, maxY: 25 },
            _imageData: { width: 1, height: 1, data: [0, 0, 0, 255] },
        },
    ],
});
test.each(
    [0, 45, 90].flatMap((angle) =>
        [0, 33].map((rotation) => ({ angle, rotation })),
    ),
)(
    'compensates a simulated directional lag at scan $angle / bitmap $rotation degrees without changing power',
    ({ angle, rotation }) => {
        const config = makeToolpathConfig({
            operation: 'laser-raster',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 2000,
            laserSpot: 0.5,
            laserOptions: { scanAngle: angle },
        });
        const original = createLaserToolpath([], config, options(rotation));
        const corrected = createLaserToolpath(
            [],
            {
                ...config,
                laserOptions: {
                    ...config.laserOptions,
                    scanAlignment: calibration,
                },
            },
            options(rotation),
        );
        expect(corrected.laserPaths).toHaveLength(original.laserPaths.length);
        for (const [i, path] of original.laserPaths.entries()) {
            const a = path.points[0],
                b = path.points[path.points.length - 1],
                length = Math.hypot(b.x - a.x, b.y - a.y);
            for (const [j, p] of path.points.entries()) {
                const command = corrected.laserPaths[i].points[j];
                expect(command.x + ((b.x - a.x) / length) * 0.2).toBeCloseTo(
                    p.x,
                    8,
                );
                expect(command.y + ((b.y - a.y) / length) * 0.2).toBeCloseTo(
                    p.y,
                    8,
                );
                expect(command.power).toBe(p.power);
            }
        }
    },
);

test('hatch correction adds unpowered overscan; single-direction, cuts and offset fills remain unchanged', () => {
    const loops = [
        {
            points: [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 20, y: 10 },
                { x: 0, y: 10 },
                { x: 0, y: 0 },
            ],
        },
    ];
    const config = makeToolpathConfig({
        operation: 'laser-fill',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 2000,
        laserPower: 500,
        laserSpot: 1,
        laserOverscan: 2,
        laserOptions: { crosshatch: true },
    });
    const corrected = createLaserToolpath(loops, {
        ...config,
        laserOptions: { ...config.laserOptions, scanAlignment: calibration },
    });
    for (const path of corrected.laserPaths) {
        expect(path.points.map((p) => p.power)).toEqual([0, 0, 500, 0]);
        expect(
            Math.hypot(
                path.points[1].x - path.points[0].x,
                path.points[1].y - path.points[0].y,
            ),
        ).toBeCloseTo(2);
    }
    for (const overrides of [
        { bidirectional: false },
        { fillMode: 'offset' },
    ]) {
        const base = { ...config, laserOptions: overrides };
        expect(
            createLaserToolpath(loops, {
                ...base,
                laserOptions: { ...overrides, scanAlignment: calibration },
            }).laserPaths,
        ).toEqual(createLaserToolpath(loops, base).laserPaths);
    }
});
