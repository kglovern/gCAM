import { copyLaserSettings } from './copy-laser-settings';
import type { ProfileArgs } from '../lib/engine';

const source: ProfileArgs = {
    operation: 'laser-raster',
    loops: [{ points: [{ x: 1, y: 2 }] }],
    toolDiameter: 1,
    cutDepth: 1,
    laserFeed: 1500,
    laserPower: 400,
    laserSMax: 350,
    laserSMin: 20,
    laserSpot: 0.1,
    laserGamma: 1.4,
    laserOverscan: 3,
    laserOptions: {
        imageMode: 'jarvis',
        brightness: 0.2,
        passes: 2,
        passThrough: true,
        imageCrop: { left: 0, bottom: 0, right: 0.5, top: 1 },
        imageMask: [],
        scanAlignment: {
            enabled: true,
            measurements: [
                { feed: 1000, gap: 0.2 },
                { feed: 2000, gap: 0.4 },
            ],
        },
    },
};
test('copies normalized CAM settings without source geometry, region or device calibration', () => {
    const before = JSON.stringify(source);
    const settings = copyLaserSettings(source, 'laser-raster', 2000);
    expect(settings).toMatchObject({
        feed: 1500,
        power: 350,
        minPower: 20,
        maxPower: 350,
        interval: 0.1,
        gamma: 1.4,
        overscan: 3,
        options: {
            imageMode: 'jarvis',
            brightness: 0.2,
            passes: 2,
            passThrough: true,
        },
    });
    const target = {
        imageCrop: { left: 0.25, bottom: 0.1, right: 1, top: 0.8 },
        imageMask: [
            [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
                { x: 0, y: 0 },
            ],
        ],
        scanAlignment: { enabled: false, measurements: [] },
    };
    const merged = { ...target, ...settings.options };
    expect(merged.imageCrop).toBe(target.imageCrop);
    expect(merged.imageMask).toBe(target.imageMask);
    expect(merged.scanAlignment).toBe(target.scanAlignment);
    expect(settings).not.toHaveProperty('loops');
    expect(settings.options).not.toHaveProperty('imageCrop');
    expect(settings.options).not.toHaveProperty('imageMask');
    expect(settings.options).not.toHaveProperty('scanAlignment');
    expect(JSON.stringify(source)).toBe(before);
});
test('legacy missing settings use normal CAM defaults and cutting power uses its own field', () => {
    const legacy = {
        operation: 'laser-cut',
        loops: [],
        toolDiameter: 1,
        cutDepth: 1,
        laserPower: 250,
    } as ProfileArgs;
    expect(copyLaserSettings(legacy, 'laser-cut')).toMatchObject({
        feed: 3000,
        power: 250,
        interval: 0.2,
        gamma: 1,
        overscan: 2,
    });
    expect(
        copyLaserSettings({ ...source, operation: 'laser-fill' }, 'laser-fill')
            .power,
    ).toBe(400);
});
test('invalid settings and incompatible operation types fail before any form updates', () => {
    expect(() => copyLaserSettings(source, 'laser-fill')).toThrow(
        'same laser type',
    );
    expect(() =>
        copyLaserSettings(
            { ...source, operation: 'profile-outside' },
            'profile-outside',
        ),
    ).toThrow('same laser type');
    expect(() => copyLaserSettings(source, 'laser-raster', 1000)).toThrow(
        'feed limit',
    );
    expect(() =>
        copyLaserSettings({ ...source, laserFeed: Infinity }, 'laser-raster'),
    ).toThrow('invalid');
    expect(() =>
        copyLaserSettings({ ...source, laserSMin: 500 }, 'laser-raster'),
    ).toThrow('invalid');
    expect(() =>
        copyLaserSettings(
            { ...source, laserOptions: { passes: 1.5 } },
            'laser-raster',
        ),
    ).toThrow('whole number');
});
