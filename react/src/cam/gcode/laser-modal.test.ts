import { exportToolpaths } from '../../gcode/exportToolpaths';
import { controllerPreset } from '../../gcode/profiles';
import { prepareGcodePreview } from '../../engine/prepare-gcode-preview';

const paths = [
    {
        feed: 1000,
        points: [
            { x: 0, y: 0, power: 0 },
            { x: 10, y: 0, power: 100 },
            { x: 10, y: 10, power: 250 },
            { x: 10, y: 10, power: 0 },
            { x: 20, y: 10, power: 500 },
        ],
    },
    {
        feed: 2000,
        points: [
            { x: 50, y: 50, power: 0 },
            { x: 40, y: 50, power: 600 },
            { x: 40, y: 40, power: 0 },
        ],
    },
];
const path = {
    operation: 'laser-raster',
    operationLabel: 'Laser Raster',
    label: 'Modal regression',
    emission: 'laser-cut',
    laserFeed: 3000,
    laserPower: 1000,
    laserSMin: 0,
    laserSMax: 1000,
    laserOptions: { passes: 2, airAssist: true },
    laserPaths: paths,
    previewContours: [],
    passDepths: [0],
    spindle: 0,
};

/** Independent modal reader: omitted coordinates/feed retain their previous values. */
function motions(code: string, maxPower: number) {
    const result: {
        x: number;
        y: number;
        power: number;
        feed: number;
        rapid: boolean;
    }[] = [];
    let x = 0,
        y = 0,
        feed = 0,
        power = 0,
        units = 1,
        on = false;
    for (const line of code.split(/\r?\n/)) {
        const words = [
            ...line
                .replace(/\([^)]*\)|;.*$/g, '')
                .matchAll(/([A-Z])([+-]?(?:\d+\.?\d*|\.\d+))/g),
        ];
        const value = (letter: string) => {
            const word = words.find((w) => w[1] === letter);
            return word ? Number(word[2]) : undefined;
        };
        const g = value('G'),
            m = value('M');
        if (g === 20) units = 25.4;
        if (g === 21) units = 1;
        if (m === 3 || m === 4) on = true;
        if (m === 5) on = false;
        if (value('F') !== undefined) feed = value('F')! * units;
        if (value('S') !== undefined) power = (value('S')! * 1000) / maxPower;
        const nx = value('X'),
            ny = value('Y');
        if (nx === undefined && ny === undefined) continue;
        if (nx !== undefined) x = nx * units;
        if (ny !== undefined) y = ny * units;
        result.push({
            x,
            y,
            power: g === 0 || !on ? 0 : power,
            feed: g === 0 ? 0 : feed,
            rapid: g === 0,
        });
    }
    return result;
}
test('compact flat moves retain every position, power and feed across passes, travel and controller dialects', () => {
    const expected = Array.from({ length: 2 }, () =>
        paths.flatMap((p) =>
            p.points.map((v, i) => ({
                x: v.x,
                y: v.y,
                power: i === 0 ? 0 : v.power,
                feed: i === 0 ? 0 : p.feed,
                rapid: i === 0,
            })),
        ),
    ).flat();
    for (const id of ['grblhal', 'grbl', 'duet', 'marlin'] as const)
        for (const units of ['metric', 'imperial'] as const) {
            if (id === 'marlin' && units === 'imperial') continue;
            const settings = { ...controllerPreset(id), laserConfirmed: true };
            const code = exportToolpaths(
                    [path],
                    'modal',
                    false,
                    units,
                    settings,
                ),
                actual = motions(code, settings.laserMax);
            expect(actual).toHaveLength(expected.length);
            actual.forEach((p, i) => {
                expect(p.x).toBeCloseTo(expected[i].x, 3);
                expect(p.y).toBeCloseTo(expected[i].y, 3);
                expect(p.power).toBeCloseTo(expected[i].power, 3);
                expect(p.feed).toBeCloseTo(expected[i].feed, 3);
                expect(p.rapid).toBe(expected[i].rapid);
            });
            expect(code).not.toMatch(/M6|G[01] Z/);
        }
});
test('viewer geometry and power agree with fully specified reference moves, including zero-length power changes', async () => {
    const compact = exportToolpaths([path], 'modal', false, 'metric');
    const explicit =
        'G21\nG90\nM4 S0\n' +
        Array.from(
            { length: 2 },
            () =>
                'G1 S0\nG0 X0 Y0\nG1 X10 Y0 S100 F1000\nG1 X10 Y10 S250 F1000\nG1 X10 Y10 S0 F1000\nG1 X20 Y10 S500 F1000\nG1 S0\nG0 X50 Y50\nG1 X40 Y50 S600 F2000\nG1 X40 Y40 S0 F2000\n',
        ).join('') +
        'M5';
    const a = await prepareGcodePreview(compact, () => {}, { laser: true }),
        b = await prepareGcodePreview(explicit, () => {}, { laser: true });
    const geometry = (data: typeof a) =>
        data.chunks.flatMap((c) => Array.from(new Float32Array(c.positions)));
    const powers = (data: typeof a) =>
        data.chunks.flatMap((c) => Array.from(new Float32Array(c.power!)));
    expect(geometry(a)).toEqual(geometry(b));
    expect(powers(a)).toEqual(powers(b));
    expect(compact).toContain(
        'G1 X10 S100 F1000\nG1 Y10 S250\nG1 X10 S0\nG1 X20 S500',
    );
});
