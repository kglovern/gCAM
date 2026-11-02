import { createLaserToolpath, laserOptions } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { controllerPreset } from '../gcode/profiles';
import { copyLaserSettings } from '../toolpaths/copy-laser-settings';
import {
    exportLaserLibrary,
    importLaserLibrary,
} from '../toolpaths/laser-recipes';

const loops = [
    {
        points: [
            { x: 20, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 40 },
            { x: 20, y: 40 },
            { x: 20, y: 20 },
        ],
    },
];
const make = (options = {}, manual = false) => {
    const args = {
        loops,
        operation: 'laser-cut' as const,
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1200,
        laserPower: 400,
        laserOptions: {
            bridges: true,
            bridgeCount: 4,
            bridgeWidth: 1,
            bridgePower: 0.2,
            ...options,
        },
        ...(manual
            ? { laserManualTabs: [{ contourIndex: 0, along: 10 }] }
            : {}),
    };
    return { args, job: createLaserToolpath(loops, makeToolpathConfig(args)) };
};
const lengthAt = (
    path: { points: { x: number; y: number; power?: number }[] },
    power: number,
) =>
    path.points
        .slice(1)
        .reduce(
            (sum, point, index) =>
                sum +
                (point.power === power
                    ? Math.hypot(
                          point.x - path.points[index].x,
                          point.y - path.points[index].y,
                      )
                    : 0),
            0,
        );

test.each([false, true])(
    'uses a fraction of cutting power without changing bridge positions/width, manual %s',
    (manual) => {
        const before = JSON.stringify(loops);
        const { job } = make({}, manual);
        const off = make({ bridgePower: 0 }, manual).job;
        expect(
            job.laserPaths.map((path) =>
                path.points.map(({ x, y }) => ({ x, y })),
            ),
        ).toEqual(
            off.laserPaths.map((path) =>
                path.points.map(({ x, y }) => ({ x, y })),
            ),
        );
        expect(lengthAt(job.laserPaths[0], 80)).toBeCloseTo(manual ? 1 : 4, 10);
        expect(lengthAt(job.laserPaths[0], 0)).toBe(0);
        expect(job.previewContours[0]._laserVariablePower).toBe(true);
        expect(
            (job.previewContours[0] as { power?: number }[]).some(
                (point) => point.power === 80,
            ),
        ).toBe(true);
        expect(JSON.stringify(loops)).toBe(before);
    },
);

test.each([false, true])(
    'perforation gaps stay off when combined with weak bridges, manual %s',
    (manual) => {
        const options = {
            perforation: true,
            perforationCut: 3,
            perforationSkip: 1,
            bridgeWidth: 3,
        };
        const base = make({ ...options, bridges: false }).job.laserPaths[0];
        const weak = make(options, manual).job.laserPaths[0];
        for (let index = 1; index < base.points.length; index++) {
            const b = base.points[index],
                a = base.points[index - 1];
            if (b.power !== 0) continue;
            const x = (a.x + b.x) / 2,
                y = (a.y + b.y) / 2;
            const containing = weak.points.slice(1).filter((end, k) => {
                const start = weak.points[k];
                return (
                    Math.abs(
                        Math.hypot(x - start.x, y - start.y) +
                            Math.hypot(x - end.x, y - end.y) -
                            Math.hypot(start.x - end.x, start.y - end.y),
                    ) < 1e-8
                );
            });
            expect(containing.length).toBeGreaterThan(0);
            expect(containing.every((p) => p.power === 0)).toBe(true);
        }
        expect(lengthAt(weak, 80)).toBeGreaterThan(0);
        expect(weak.points.every((p) => [0, 80, 400].includes(p.power))).toBe(
            true,
        );
    },
);

test('leads attach to full-power runs and overcut/passes retain the reduced powers', () => {
    const { job } = make({
        leadInLength: 0.5,
        leadOutLength: 0.5,
        overcut: 15,
        passes: 2,
        preferCornerStarts: true,
    });
    expect(job.laserPaths[0].points[0].power).toBe(400);
    expect(job.laserPaths[0].points[1].power).toBe(400);
    const code = exportToolpaths([job], 'weak', true, 'metric');
    expect(code).toContain('S80');
    expect(code.match(/Laser pass/g)).toHaveLength(2);
    expect(code).not.toMatch(/G[01] Z|M6/);
});

test('controller scaling, copied settings and portable materials retain bridge power', () => {
    const { job, args } = make();
    for (const [id, expected] of [
        ['grblhal', 'S80'],
        ['duet', 'S20.4'],
        ['marlin', 'S20.4'],
    ] as const) {
        const code = exportToolpaths([job], 'weak', false, 'metric', {
            ...controllerPreset(id),
            laserConfirmed: true,
        });
        expect(code).toContain(expected);
    }
    expect(copyLaserSettings(args, 'laser-cut').options.bridgePower).toBe(0.2);
    const recipe = {
        id: 'weak',
        name: 'Weak bridges',
        laser: 'DIY',
        machine: 'longmill-router',
        material: 'plywood',
        thickness: 3,
        operation: 'laser-cut',
        feed: 1200,
        power: 400,
        interval: 0.2,
        options: args.laserOptions,
        source: 'User settings',
    };
    expect(
        importLaserLibrary(exportLaserLibrary([recipe]), [])[0].options
            .bridgePower,
    ).toBe(0.2);
});

test('legacy bridges default to off and invalid fractions cannot generate output', () => {
    expect(laserOptions({ bridges: true }).bridgePower).toBe(0);
    for (const bridgePower of [-0.1, 1.1, NaN, Infinity])
        expect(() => make({ bridgePower })).toThrow('bridgePower');
});
