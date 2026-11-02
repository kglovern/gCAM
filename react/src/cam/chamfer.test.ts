import { edgeChamferDimensions, normalizeChamfer } from './chamfer.js';
import { createToolpathFromLoops } from './cam-ops.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { buildToolpathGcode } from '../lib/engine';
import { buildGcode } from './gcode/program.js';

const rect = (x: number, y: number, w: number, h: number) => ({
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const outer = rect(0, 0, 20, 20),
    hole = rect(8, 8, 4, 4);
const config = (extra = {}) =>
    makeToolpathConfig({
        operation: 'chamfer',
        toolDiameter: 12,
        cutDepth: 3,
        passDepth: 0.5,
        cutterAngle: 90,
        ...extra,
    });
const bounds = (points: { x: number; y: number }[]) => ({
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
});
test.each([60, 90, 120])(
    'actual offset path and depth preserve a 1 mm top chamfer at %s degrees',
    (angle) => {
        const result = createToolpathFromLoops(
            [outer, hole],
            config({
                cutterAngle: angle,
                chamferWidthMm: 1,
                chamferTipOffsetMm: 0.5,
            }),
        );
        const paths = result.previewContours
            .map(bounds)
            .sort((a, b) => a.minX - b.minX);
        const sideOffset = 0.5 * Math.tan((angle * Math.PI) / 360);
        expect(paths).toHaveLength(2);
        expect(paths[0].minX).toBeCloseTo(-sideOffset, 3);
        expect(paths[1].minX).toBeCloseTo(8 + sideOffset, 3);
        expect(result.cutDepth).toBeCloseTo(
            1 / Math.tan((angle * Math.PI) / 360) + 0.5,
        );
        expect(result.passDepths[result.passDepths.length - 1]).toBeCloseTo(
            -result.cutDepth,
            4,
        );
        // At the top surface the cone's radius, less its distance outside the edge, is the requested width.
        expect(
            result.cutDepth * Math.tan((angle * Math.PI) / 360) -
                Math.abs(paths[0].minX),
        ).toBeCloseTo(1, 3);
        const code = buildGcode({
            toolpaths: [result],
            fileName: 'chamfer',
            forcePolylineArcs: true,
        });
        expect(code).not.toMatch(/NaN|Infinity/);
        expect(code).toContain('Chamfer');
    },
);
test('zero tip offset stays on the selected edge, while legacy centreline jobs remain byte-identical', async () => {
    const original = createToolpathFromLoops([outer, hole], config());
    expect(normalizeChamfer(config())).toEqual(config());
    expect(original.previewContours[0]).toEqual(outer.points);
    const result = createToolpathFromLoops(
        [outer, hole],
        config({ chamferWidthMm: 1, chamferTipOffsetMm: 0 }),
    );
    expect(result.cutDepth).toBeCloseTo(1);
    expect(
        result.previewContours.map(bounds).sort((a, b) => a.minX - b.minX)[0]
            .minX,
    ).toBe(0);
    const args = {
        loops: [outer],
        operation: 'chamfer' as const,
        cutDepth: 1,
        toolDiameter: 6,
        cutterAngle: 90,
    };
    const before = await buildToolpathGcode(args),
        after = await buildToolpathGcode({ ...args, chamferTipOffsetMm: 0.5 });
    expect(after.gcode).toBe(before.gcode);
    const edge = await buildToolpathGcode({
        ...args,
        chamferWidthMm: 0.75,
        chamferTipOffsetMm: 0.5,
        stockThicknessMm: 18,
    });
    expect(edge.toolpath.cutDepth).toBeCloseTo(1.25);
    expect(edge.toolpath.chamferWidthMm).toBe(0.75);
});
test('rejects unsupported/unsafe edges and altered dimensions before export', () => {
    const settings = { chamferWidthMm: 1, chamferTipOffsetMm: 0.5 };
    for (const values of [
        [0, 0, 90, 6],
        [1, -1, 90, 6],
        [1, 0, 180, 6],
        [1, 0, NaN, 6],
        [3, 1, 90, 6],
        [0.001, 0, 90, 6],
    ])
        expect(() =>
            edgeChamferDimensions(
                ...(values as [number, number, number, number]),
            ),
        ).toThrow();
    expect(() =>
        createToolpathFromLoops(
            [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 5, y: 0 },
                    ],
                },
            ],
            config(settings),
        ),
    ).toThrow('closed outlines');
    expect(() =>
        createToolpathFromLoops(
            [outer, rect(9, 9, 0.5, 0.5)],
            config({ ...settings, chamferTipOffsetMm: 1 }),
        ),
    ).toThrow('closes a hole');
    expect(() =>
        createToolpathFromLoops(
            [outer],
            config({ ...settings, stockThicknessMm: 1 }),
        ),
    ).toThrow('below the stock');
    const result = createToolpathFromLoops([outer], config(settings));
    expect(() =>
        buildGcode({
            toolpaths: [{ ...result, cutDepth: 9 }],
            fileName: 'invalid',
            forcePolylineArcs: true,
        }),
    ).toThrow('Regenerate');
});
