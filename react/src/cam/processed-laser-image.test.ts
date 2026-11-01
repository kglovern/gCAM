import { processLaserImage, createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';

const modes = [
    'grayscale',
    'threshold',
    'ordered',
    'floyd-steinberg',
    'atkinson',
    'jarvis',
    'stucki',
    'halftone',
    'edge',
];
const bitmap = {
    type: 'BITMAP',
    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
    _imageData: {
        width: 4,
        height: 3,
        data: new Uint8ClampedArray([
            0, 0, 0, 255, 80, 80, 80, 255, 160, 160, 160, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 50, 100, 150, 255, 30, 30, 30, 128, 0, 0,
            0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255,
            255,
        ]),
    },
};

test.each(modes)(
    '%s processed pixels agree with emitted CAM powers',
    (mode) => {
        const options = {
            imageMode: mode,
            halftoneCellSize: 2,
            halftoneAngle: 30,
            brightness: 0.1,
            contrast: 1.2,
            trimBlank: false,
        };
        const image = processLaserImage(bitmap, 1, 1.3, options);
        const config = makeToolpathConfig({
            operation: 'laser-raster',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 255,
            laserSMin: 0,
            laserSMax: 255,
            laserGamma: 1.3,
            laserSpot: 1,
            laserOverscan: 0,
            laserOptions: options as any,
        });
        const cam = createLaserToolpath([], config, {
            sourceEntities: [bitmap],
        });
        expect([
            image.width,
            image.height,
            image.widthMm,
            image.heightMm,
        ]).toEqual([4, 3, 4, 3]);
        for (let row = 0; row < 3; row++)
            for (let col = 0; col < 4; col++) {
                const x = col + 0.5,
                    y = 2.5 - row;
                let power = 0;
                for (const path of cam.laserPaths)
                    for (let j = 1; j < path.points.length; j++) {
                        const a = path.points[j - 1],
                            b = path.points[j];
                        if (
                            Math.abs(a.y - y) < 1e-8 &&
                            x > Math.min(a.x, b.x) &&
                            x < Math.max(a.x, b.x)
                        )
                            power = b.power;
                    }
                const i = (row * 4 + col) * 4;
                expect(Array.from(image.data.slice(i, i + 4))).toEqual([
                    255 - power,
                    255 - power,
                    255 - power,
                    255,
                ]);
            }
    },
);

test('crop, holes and transparent pixels export on white without changing the source', () => {
    const before = Array.from(bitmap._imageData.data);
    const image = processLaserImage(bitmap, 1, 1, {
        imageCrop: { left: 0.25, right: 0.75, bottom: 0, top: 1 },
        imageMask: [
            [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 0, y: 1 },
                { x: 0, y: 0 },
            ],
            [
                { x: 0.3, y: 0.3 },
                { x: 0.7, y: 0.3 },
                { x: 0.7, y: 0.7 },
                { x: 0.3, y: 0.7 },
                { x: 0.3, y: 0.3 },
            ],
        ],
    });
    expect([image.width, image.height, image.widthMm, image.heightMm]).toEqual([
        2, 3, 2, 3,
    ]);
    expect(Array.from(image.data.slice(8, 16))).toEqual(Array(8).fill(255));
    expect(Array.from(bitmap._imageData.data)).toEqual(before);
});

test('processing excludes scan angle, passes, travel correction and bitmap placement rotation', () => {
    expect(
        processLaserImage({ ...bitmap, rotation: 73 }, 1, 1, {
            scanAngle: 45,
            passes: 100,
            angleIncrement: 30,
            dotWidthCorrection: 9,
        }),
    ).toEqual(processLaserImage(bitmap, 1, 1));
});

test('invalid or excessive image exports fail before allocation', () => {
    expect(() => processLaserImage(bitmap, 0, 1)).toThrow('resolution');
    expect(() => processLaserImage(bitmap, 1, NaN)).toThrow('gamma');
    expect(() =>
        processLaserImage(
            {
                ...bitmap,
                bounds: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
            },
            0.01,
            1,
        ),
    ).toThrow('16 million');
});

test.each([0.1, 0.3, 38.257, 400.53, 10000])(
    'translation %s does not add a sample row or column from floating-point noise',
    (offset) => {
        const image = processLaserImage(
            {
                ...bitmap,
                bounds: {
                    minX: offset,
                    minY: offset,
                    maxX: offset + 80,
                    maxY: offset + 40,
                },
            },
            0.1,
            1,
            { imageCrop: { left: 0.25, right: 0.75, bottom: 0, top: 1 } },
        );
        expect([image.width, image.height]).toEqual([400, 400]);
    },
);
