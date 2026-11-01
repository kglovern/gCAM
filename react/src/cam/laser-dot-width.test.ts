import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { correctLaserDots } from './laser-dot-width.js';
import { createLaserToolpath } from './laser.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { DEFAULT_OUTPUT } from '../gcode/profiles';
const point = (x: number, power: number) => ({ x, y: 0, power });
test.each([1, -1])(
    'shortens isolated dots symmetrically in direction %s',
    (direction) => {
        const p = correctLaserDots(
            [point(0, 0), point(direction, 1000), point(2 * direction, 0)],
            0.2,
            100,
        );
        expect(p.map((v) => [v.x, v.power])).toEqual([
            [0, 0],
            [direction * 0.1, 0],
            [direction * 0.9, 1000],
            [direction, 0],
            [2 * direction, 0],
        ]);
    },
);
test('retains tone changes inside a continuous powered run', () => {
    const p = correctLaserDots(
        [point(0, 0), point(1, 250), point(2, 750)],
        0.2,
        100,
    );
    expect(p.map((v) => [v.x, v.power])).toEqual([
        [0, 0],
        [0.1, 0],
        [1, 250],
        [1.9, 750],
        [2, 0],
    ]);
});
test('omits dots too short to correct without reversing or leaving zero-length burns', () => {
    const p = correctLaserDots(
        [point(0, 0), point(0.05, 1000), point(1, 0)],
        0.1,
        100,
    );
    expect(p.every((v) => v.power === 0)).toBe(true);
    expect(p.map((v) => v.x)).toEqual([0, 0.05, 1]);
});
test('zero preserves exact original points and added endpoints obey the output budget', () => {
    const p = [point(0, 0), point(1, 1000)];
    expect(correctLaserDots(p, 0, 1)).toBe(p);
    expect(() => correctLaserDots(p, 0.1, 3)).toThrow(/too large/);
});
function raster(correction: number, scanAngle = 0) {
    return createLaserToolpath(
        [],
        makeToolpathConfig({
            operation: 'laser-raster',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 1000,
            laserSMin: 0,
            laserSMax: 1000,
            laserGamma: 1,
            laserSpot: 1,
            laserOverscan: 2,
            laserOptions: {
                imageMode: 'threshold',
                dotWidthCorrection: correction,
                scanAngle,
            },
        }),
        {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 2 },
                    _imageData: {
                        width: 4,
                        height: 2,
                        data: [0, 255, 0, 255, 0, 255, 0, 255].flatMap((v) => [
                            v,
                            v,
                            v,
                            255,
                        ]),
                    },
                },
            ],
        },
    );
}
test.each([0, 45, 90])(
    'corrected raster preview and paths agree at %s degrees',
    (angle) => {
        const before = raster(0, angle),
            after = raster(0.2, angle);
        expect(after.laserPaths).toHaveLength(before.laserPaths.length);
        const lengths = (path: typeof before) =>
            path.laserPaths.flatMap((row) =>
                row.points
                    .slice(1)
                    .flatMap((p, i) =>
                        p.power
                            ? [
                                  Math.hypot(
                                      p.x - row.points[i].x,
                                      p.y - row.points[i].y,
                                  ),
                              ]
                            : [],
                    ),
            );
        expect(lengths(after).reduce((a, b) => a + b, 0)).toBeLessThan(
            lengths(before).reduce((a, b) => a + b, 0),
        );
        for (const contour of after.previewContours) {
            const path = after.laserPaths.find(
                (p) => p.points[0] === contour[0],
            );
            expect(path).toBeDefined();
            expect([...contour]).toEqual(path!.points);
        }
    },
);
test('rejects a correction at the interval and insufficient export precision', () => {
    expect(() => raster(1)).toThrow(/smaller than/);
    const p = raster(0.02);
    expect(() =>
        exportToolpaths([p], 'test', false, 'imperial', {
            ...DEFAULT_OUTPUT,
            decimals: 3,
        }),
    ).toThrow(/precision/);
    expect(exportToolpaths([p], 'test', false, 'metric')).toContain('S1000');
});
