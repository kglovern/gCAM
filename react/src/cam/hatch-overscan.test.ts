import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildGcode } from './gcode/program.js';
import { strokePoweredPath } from '../canvas/poweredPath';
const rectangle = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
];
const loops = [
    { points: rectangle(0, 0, 20, 10) },
    { points: rectangle(5, 3, 4, 4) },
];
const config = makeToolpathConfig({
    operation: 'laser-fill',
    toolDiameter: 1,
    cutDepth: 1,
    laserPower: 300,
    laserFeed: 2400,
    laserSpot: 1,
    laserOverscan: 3,
});

test.each(
    [0, 45, 90].flatMap((angle) =>
        [false, true].map((bidirectional) => ({ angle, bidirectional })),
    ),
)(
    'individual hatch leads are unpowered at $angle degrees / bidirectional $bidirectional and preserve holes',
    ({ angle, bidirectional }) => {
        const options = {
            fillAngle: angle,
            bidirectional,
            fillSequence: 'individual',
        };
        const bare = createLaserToolpath(loops, {
            ...config,
            laserOptions: { ...options, hatchOverscan: false },
        });
        const lead = createLaserToolpath(loops, {
            ...config,
            laserOptions: options,
        });
        expect(lead.laserPaths).toHaveLength(bare.laserPaths.length);
        const strokes: { x: number; y: number }[][] = [];
        let a = { x: 0, y: 0 },
            b = { x: 0, y: 0 };
        const ctx = {
            globalAlpha: 1,
            beginPath() {},
            moveTo(x: number, y: number) {
                a = { x, y };
            },
            lineTo(x: number, y: number) {
                b = { x, y };
            },
            stroke() {
                expect(this.globalAlpha).toBe(0.3);
                strokes.push([a, b]);
            },
        };
        for (const [i, path] of lead.laserPaths.entries()) {
            const points = path.points,
                original = bare.laserPaths[i].points;
            expect(points.map((p) => p.power)).toEqual([0, 0, 300, 0]);
            expect(points[1]).toEqual({ ...original[0], power: 0 });
            expect(points[2]).toEqual(original[1]);
            const dx = original[1].x - original[0].x,
                dy = original[1].y - original[0].y,
                length = Math.hypot(dx, dy);
            expect(points[0].x).toBeCloseTo(
                original[0].x - (3 * dx) / length,
                8,
            );
            expect(points[0].y).toBeCloseTo(
                original[0].y - (3 * dy) / length,
                8,
            );
            expect(points[3].x).toBeCloseTo(
                original[1].x + (3 * dx) / length,
                8,
            );
            expect(points[3].y).toBeCloseTo(
                original[1].y + (3 * dy) / length,
                8,
            );
            strokePoweredPath(
                ctx as unknown as CanvasRenderingContext2D,
                lead.previewContours[i],
                (x, y) => ({ x, y }),
            );
        }
        expect(strokes).toEqual(
            bare.laserPaths.map((p) => p.points.map(({ x, y }) => ({ x, y }))),
        );
    },
);

test('zero distance or explicit disable keeps the old emitted fill; cuts and offset fills are unaffected', () => {
    const bare = createLaserToolpath(loops, {
        ...config,
        laserOptions: { hatchOverscan: false },
    });
    const zero = createLaserToolpath(loops, { ...config, laserOverscan: 0 });
    const code = (path: Record<string, unknown>) =>
        buildGcode({
            toolpaths: [path],
            fileName: 'test',
            forcePolylineArcs: true,
        });
    expect(code(zero)).toBe(code(bare));
    for (const operation of ['laser-cut', 'laser-fill']) {
        const cfg = {
            ...config,
            operation,
            laserOptions: { fillMode: 'offset' },
        };
        expect(createLaserToolpath(loops, cfg).laserPaths).toEqual(
            createLaserToolpath(loops, { ...cfg, laserOverscan: 0 }).laserPaths,
        );
    }
});

test('expanded hatch leads count toward the output budget before extension allocation', () => {
    expect(() =>
        createLaserToolpath([{ points: rectangle(0, 0, 20, 1000) }], {
            ...config,
            laserSpot: 0.1,
            laserOptions: { passes: 100 },
        }),
    ).toThrow('Laser job is too large');
});
