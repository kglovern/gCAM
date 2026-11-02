import {
    createLaserToolpath,
    processLaserImage,
    laserOptions,
} from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { controllerPreset } from '../gcode/profiles';

const values = [
    0, 255, 64, 192, 0, 255, 0, 255, 255, 0, 255, 0, 128, 64, 255, 0, 0, 0, 255,
    255, 0, 0, 255, 255, 255, 255, 0, 0, 255, 255, 0, 0,
];
const bitmap = {
    type: 'BITMAP',
    bounds: { minX: 10.3, minY: 5.2, maxX: 18.3, maxY: 9.2 },
    _imageData: {
        width: 8,
        height: 4,
        data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255])),
    },
};
const config = (extra = {}) =>
    makeToolpathConfig({
        operation: 'laser-raster',
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 1000,
        laserSMax: 1000,
        laserSMin: 0,
        laserGamma: 2.1,
        laserSpot: 0.001,
        laserOverscan: 0,
        laserOptions: { passThrough: true, trimBlank: false, ...extra },
    });

test.each([
    'grayscale',
    'threshold',
    'ordered',
    'floyd-steinberg',
    'atkinson',
    'jarvis',
    'stucki',
    'halftone',
    'edge',
])(
    '%s processing is bypassed without resampling or changing gray pixels',
    (imageMode) => {
        const image = processLaserImage(bitmap, 0.001, 2.1, {
            passThrough: true,
            imageMode,
            brightness: 1,
            contrast: 5,
            invert: true,
            shadeCount: 2,
            smoothing: 1,
            sharpening: 2,
            filterRadius: 16,
            sharpeningDenoise: 1,
            grayscale: 'red',
            halftoneCellSize: 0.01,
        });
        expect([image.width, image.height]).toEqual([8, 4]);
        expect(image.widthMm).toBeCloseTo(8);
        expect(image.heightMm).toBeCloseTo(4);
        expect(image.data).toEqual(bitmap._imageData.data);
    },
);

test.each([0, 90, 180, 270, -90])(
    'native scan angle %s visits every original pixel once with correct power',
    (scanAngle) => {
        const cam = createLaserToolpath([], config({ scanAngle }), {
            sourceEntities: [bitmap],
        });
        expect(cam.laserSpot).toBeCloseTo(1);
        expect(cam.laserPaths).toHaveLength(
            Math.abs(scanAngle / 90) % 2 ? 8 : 4,
        );
        for (let row = 0; row < 4; row++)
            for (let col = 0; col < 8; col++) {
                const p = { x: 10.3 + col + 0.5, y: 5.2 + 4 - row - 0.5 };
                const hits: number[] = [];
                for (const path of cam.laserPaths)
                    for (let j = 1; j < path.points.length; j++) {
                        const a = path.points[j - 1],
                            b = path.points[j];
                        const vx = b.x - a.x,
                            vy = b.y - a.y,
                            length2 = vx * vx + vy * vy;
                        if (length2 < 1e-12) continue;
                        const t =
                            ((p.x - a.x) * vx + (p.y - a.y) * vy) / length2;
                        if (
                            t > 1e-8 &&
                            t < 1 - 1e-8 &&
                            Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy) <
                                1e-7
                        )
                            hits.push(b.power);
                    }
                expect(hits).toEqual([
                    Math.round((1 - values[row * 8 + col] / 255) * 1000),
                ]);
            }
    },
);

test('native crops snap outward to source pixels, masks preserve holes and transparency remains off', () => {
    const crop = { left: 0.26, right: 0.74, bottom: 0.26, top: 0.74 };
    const image = processLaserImage(bitmap, 0.1, 1, {
        passThrough: true,
        imageCrop: crop,
    });
    expect([image.width, image.height]).toEqual([4, 2]);
    expect(image.widthMm).toBeCloseTo(4);
    expect(image.heightMm).toBeCloseTo(2);
    const expected = [1, 2].flatMap((row) =>
        Array.from(
            bitmap._imageData.data.slice((row * 8 + 2) * 4, (row * 8 + 6) * 4),
        ),
    );
    expect(Array.from(image.data)).toEqual(expected);
    const masked = processLaserImage(bitmap, 0.1, 1, {
        passThrough: true,
        imageMask: [
            [
                { x: 0, y: 0 },
                { x: 0.5, y: 0 },
                { x: 0.5, y: 1 },
                { x: 0, y: 1 },
                { x: 0, y: 0 },
            ],
        ],
    });
    for (let row = 0; row < 4; row++)
        expect(
            Array.from(masked.data.slice((row * 8 + 4) * 4, (row * 8 + 8) * 4)),
        ).toEqual(Array(16).fill(255));
    const transparent = {
        ...bitmap,
        _imageData: {
            ...bitmap._imageData,
            data: new Uint8ClampedArray(bitmap._imageData.data),
        },
    };
    transparent._imageData.data[3] = 0;
    expect(
        Array.from(
            processLaserImage(transparent, 0.1, 1, {
                passThrough: true,
            }).data.slice(0, 4),
        ),
    ).toEqual([255, 255, 255, 255]);
});

test('native geometry scales with image size and supports rotated artwork and right-angle pass increments', () => {
    const doubled = {
        ...bitmap,
        bounds: { minX: 10.3, minY: 5.2, maxX: 26.3, maxY: 13.2 },
    };
    const image = processLaserImage(doubled, 0.001, 1, { passThrough: true });
    expect([image.width, image.height]).toEqual([8, 4]);
    expect(image.widthMm).toBeCloseTo(16);
    const cam = createLaserToolpath(
        [],
        config({ passes: 2, angleIncrement: 90 }),
        { sourceEntities: [{ ...bitmap, rotation: 30 }] },
    );
    expect(cam.laserPaths).toHaveLength(12);
    expect(cam.laserPassCount).toBe(2);
    expect(
        cam.laserPaths
            .flatMap((p) => p.points)
            .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ).toBe(true);
});

test('unsupported scan angles, malformed flags and unrepresentable output fail explicitly', () => {
    expect(() =>
        createLaserToolpath([], config({ scanAngle: 15 }), {
            sourceEntities: [bitmap],
        }),
    ).toThrow('90°');
    expect(() =>
        createLaserToolpath([], config({ passes: 2, angleIncrement: 15 }), {
            sourceEntities: [bitmap],
        }),
    ).toThrow('90°');
    expect(() => laserOptions({ passThrough: 'yes' })).toThrow('passThrough');
    const cam = createLaserToolpath([], config(), { sourceEntities: [bitmap] });
    const settings = controllerPreset('grblhal');
    expect(
        exportToolpaths([cam], 'native', false, 'metric', settings),
    ).toContain('S1000');
    expect(() =>
        exportToolpaths(
            [{ ...cam, laserSpot: 0.001 }],
            'native',
            false,
            'metric',
            { ...settings, decimals: 2 },
        ),
    ).toThrow('coordinate precision');
    expect(() =>
        exportToolpaths(
            [{ ...cam, laserSpot: 0.01 }],
            'native',
            false,
            'imperial',
            { ...settings, decimals: 3 },
        ),
    ).toThrow('coordinate precision');
});

test('native limits require source resizing and a stretched image keeps rectangular pixels', () => {
    expect(() =>
        processLaserImage(
            {
                ...bitmap,
                _imageData: {
                    width: 4001,
                    height: 4000,
                    data: { length: 4001 * 4000 * 4 },
                },
            },
            0.1,
            1,
            { passThrough: true },
        ),
    ).toThrow('resize the source image');
    const stretched = {
        ...bitmap,
        bounds: { minX: 0, minY: 0, maxX: 8, maxY: 8 },
    };
    const zero = createLaserToolpath([], config({ scanAngle: 0 }), {
        sourceEntities: [stretched],
    });
    const ninety = createLaserToolpath([], config({ scanAngle: 90 }), {
        sourceEntities: [stretched],
    });
    expect(zero.laserPaths[0].laserInterval).toBeCloseTo(2);
    expect(ninety.laserPaths[0].laserInterval).toBeCloseTo(1);
});
