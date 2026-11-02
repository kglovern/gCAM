import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import {
    serializeProject,
    deserializeProject,
    type ProjectSnapshot,
} from '../lib/project';
const square = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
    { x: 0, y: 0 },
];
const bitmap = {
    sourceEntities: [
        {
            type: 'BITMAP',
            bounds: { minX: 0, minY: 0, maxX: 8, maxY: 6 },
            _imageData: { width: 1, height: 1, data: [0, 0, 0, 255] },
        },
    ],
};
const config = (operation: string, options = {}) =>
    makeToolpathConfig({
        operation,
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 250,
        laserSMin: 0,
        laserSMax: 250,
        laserGamma: 1,
        laserSpot: 1,
        laserOverscan: 2,
        laserOptions: options,
    });
test.each(['laser-raster', 'laser-fill'])(
    '%s plans ordered 0/45/90 passes once and reloads without multiplying output',
    (operation) => {
        const args = config(operation, { passes: 3, angleIncrement: 45 });
        const result = createLaserToolpath([{ points: square }], args, bitmap);
        const expected = [0, 45, 90].flatMap(
            (angle) =>
                createLaserToolpath(
                    [{ points: square }],
                    config(operation, { scanAngle: angle, fillAngle: angle }),
                    bitmap,
                ).laserPaths,
        );
        expect(result.laserPaths.map((p) => p.points)).toEqual(
            expected.map((p) => p.points),
        );
        expect(result.laserOptions.passes).toBe(1);
        expect(result.laserPassCount).toBe(3);
        const code = exportToolpaths([result], 'angles', false, 'metric');
        for (const pass of [1, 2, 3])
            expect(
                code.match(new RegExp(`Laser pass ${pass}`, 'g')),
            ).toHaveLength(1);
        const snapshot: ProjectSnapshot = {
            fileName: 'angles',
            loops: [],
            selected: [],
            hidden: [],
            guides: [],
            bitmaps: [],
            stack: [
                {
                    id: 'test',
                    label: 'Angles',
                    args,
                    toolpath: result,
                    preview: [],
                },
            ],
        };
        const loaded = deserializeProject(serializeProject(snapshot));
        expect(
            exportToolpaths(
                [loaded.stack[0].toolpath],
                'angles',
                false,
                'metric',
            ),
        ).toBe(code);
        expect((loaded.stack[0].args as typeof args).laserOptions?.passes).toBe(
            3,
        );
    },
);
test('negative increments wrap and zero retains the repeated-path format', () => {
    const planned = createLaserToolpath(
        [],
        config('laser-raster', { passes: 2, angleIncrement: -90 }),
        bitmap,
    );
    const expected = createLaserToolpath(
        [],
        config('laser-raster', { scanAngle: 270 }),
        bitmap,
    );
    const start = planned.laserPaths.findIndex((p) => p.laserPassStart === 2);
    expect(planned.laserPaths.slice(start).map((p) => p.points)).toEqual(
        expected.laserPaths.map((p) => p.points),
    );
    const unchanged = createLaserToolpath(
        [],
        config('laser-raster', { passes: 3 }),
        bitmap,
    );
    expect(unchanged.laserOptions.passes).toBe(3);
    expect(unchanged.laserPassCount).toBeUndefined();
});
test('all angle passes share the output budget', () => {
    expect(() =>
        createLaserToolpath(
            [],
            config('laser-raster', { passes: 3, angleIncrement: 45 }),
            { ...bitmap, _pointBudget: 30 },
        ),
    ).toThrow(/too large/);
});

test('repeated directions share geometry and full turns retain compact repetition', () => {
    const result = createLaserToolpath(
        [],
        config('laser-raster', { passes: 5, angleIncrement: 90 }),
        bitmap,
    );
    const fifth = result.laserPaths.find((p) => p.laserPassStart === 5)!;
    expect(fifth.points).toBe(result.laserPaths[0].points);
    const fullTurn = createLaserToolpath(
        [],
        config('laser-raster', { passes: 5, angleIncrement: 360 }),
        bitmap,
    );
    expect(fullTurn.laserOptions.passes).toBe(5);
    expect(fullTurn.laserPassCount).toBeUndefined();
});
