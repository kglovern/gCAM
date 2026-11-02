import { createHalftoneScreen } from './halftone.js';
import { imageLightness } from './image-lightness.js';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
test.each([0.1, 0.25, 0.5, 0.75, 0.9])(
    'halftone covered area tracks %s darkness',
    (tone) => {
        const screen = createHalftoneScreen(1, 0);
        let on = 0;
        for (let y = 0; y < 200; y++)
            for (let x = 0; x < 200; x++)
                on += screen(tone, (x + 0.5) / 200, (y + 0.5) / 200);
        expect(on / 40000).toBeCloseTo(tone, 2);
    },
);
test('screen repeats physically, preserves black/white and rotates independently of scan direction', () => {
    const screen = createHalftoneScreen(2, 0),
        rotated = createHalftoneScreen(2, 90);
    for (const [x, y] of [
        [0.2, 0.4],
        [0.7, 1.1],
        [1.4, 0.3],
    ]) {
        expect(screen(0.4, x, y)).toBe(screen(0.4, x + 2, y));
        expect(rotated(0.4, x, y)).toBe(screen(0.4, y, -x));
        expect(screen(0, x, y)).toBe(0);
        expect(screen(1, x, y)).toBe(1);
    }
});
test('edge extraction ignores flat tone and concealed transparent RGB', () => {
    const flat = {
        width: 3,
        height: 1,
        data: [100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255],
    };
    expect(imageLightness(flat, 1, 0, 0, 0, 'luminance', 1)).toBeCloseTo(1);
    const hidden = {
        width: 3,
        height: 1,
        data: [255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0],
    };
    expect(imageLightness(hidden, 1, 0, 0, 0, 'luminance', 1)).toBe(0);
    hidden.data[0] =
        hidden.data[1] =
        hidden.data[2] =
        hidden.data[8] =
        hidden.data[9] =
        hidden.data[10] =
            0;
    expect(imageLightness(hidden, 1, 0, 0, 0, 'luminance', 1)).toBe(0);
});
const config = (mode: string, extra = {}) =>
    makeToolpathConfig({
        operation: 'laser-raster',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 500,
        laserSMin: 0,
        laserSMax: 500,
        laserGamma: 1,
        laserSpot: 0.1,
        laserOverscan: 1,
        laserOptions: { imageMode: mode as 'halftone' | 'edge', ...extra },
    });
test.each(['halftone', 'edge'])(
    '%s uses binary power and leaves transparent areas unpowered',
    (mode) => {
        const result = createLaserToolpath([], config(mode), {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 2 },
                    _imageData: {
                        width: 4,
                        height: 1,
                        data: [
                            0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0,
                            0, 0, 0,
                        ],
                    },
                },
            ],
        });
        const powers = result.laserPaths.flatMap((p) =>
            p.points.map((v) => v.power),
        );
        expect(powers.some((v) => v === 500)).toBe(true);
        expect(powers.every((v) => v === 0 || v === 500)).toBe(true);
        for (const row of result.laserPaths)
            for (let i = 1; i < row.points.length; i++)
                if (row.points[i].power)
                    expect(
                        Math.max(row.points[i].x, row.points[i - 1].x),
                    ).toBeLessThanOrEqual(3);
    },
);
test('rejects undersampled dot grids before planning', () => {
    expect(() =>
        createLaserToolpath([], config('halftone', { halftoneCellSize: 0.1 })),
    ).toThrow(/twice/);
});
