import { createLaserToolpath } from '../cam/laser.js';
import { laserExportPayload } from './laserExportPayload';
import { exportToolpaths } from './exportToolpaths';
import { controllerPreset } from './profiles';
const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
];
const path = createLaserToolpath([{ points }], {
    operation: 'laser-cut',
    spindle: 12000,
    feedRate: 1200,
    plungeRate: 300,
    safeZ: 5,
    toolDiameter: 1,
    toolNumber: 1,
    laserFeed: 1200,
    laserPower: 250,
    laserSMin: 0,
    laserSMax: 1000,
    laserSpot: 0.2,
    laserGamma: 1,
    laserOverscan: 0,
    laserOptions: { passes: 2, airAssist: true },
});
test('slim worker payload preserves exact controller output and leaves construction geometry behind', () => {
    const source = { ...path, construction: { reverse: () => [] } };
    const payload = laserExportPayload([source]);
    expect(payload[0].construction).toBeUndefined();
    expect(payload[0].previewContours).toEqual([]);
    expect(payload[0].laserPaths).toBe(path.laserPaths);
    for (const id of ['grblhal', 'grbl', 'duet', 'marlin'] as const)
        for (const units of ['metric', 'imperial'] as const) {
            if (id === 'marlin' && units === 'imperial') {
                expect(() =>
                    exportToolpaths(payload, 'job', false, units, {
                        ...controllerPreset(id),
                        laserConfirmed: true,
                    }),
                ).toThrow('millimetres');
                continue;
            }
            const settings = { ...controllerPreset(id), laserConfirmed: true };
            expect(
                exportToolpaths(payload, 'job', false, units, settings),
            ).toBe(exportToolpaths([source], 'job', false, units, settings));
        }
    expect(() =>
        exportToolpaths(
            laserExportPayload([{ ...source, laserPower: NaN }]),
            'job',
            false,
            'metric',
        ),
    ).toThrow('power');
});
