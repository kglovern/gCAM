import { vCarveClearingRegion, vCarveFinishPaths } from './vcarve-clearing.js';
import { createToolpathFromLoops, buildGcode } from './cam-ops.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
const rect = (x: number, y: number, w: number, h: number) => ({
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const loops = [rect(0, 0, 80, 60), rect(30, 20, 20, 20)];
test('finishing clips corner spokes at the true pass-plane intersection and omits deep floor spans', () => {
    const natural = [
        {
            points: [
                { x: 0, y: 0, z: 0 },
                { x: 40, y: 40, z: -40 },
                { x: 80, y: 80, z: 0 },
            ],
        },
    ];
    const before = JSON.stringify(natural);
    const paths = vCarveFinishPaths(
        natural,
        [rect(0, 0, 80, 80)],
        3,
        1,
        90,
        12,
    );
    expect(paths).toHaveLength(9);
    const corners = paths.filter((p) => p.points.length === 2);
    expect(corners).toHaveLength(6);
    expect(corners.map((p) => p.points.map((v: { z: number }) => v.z))).toEqual(
        [
            [0, -1],
            [-1, 0],
            [0, -2],
            [-2, 0],
            [0, -3],
            [-3, 0],
        ],
    );
    expect(corners[4].points[1]).toEqual({ x: 3, y: 3, z: -3 });
    expect(
        paths.flatMap((p) => p.points).some((p) => p.x === 40 && p.y === 40),
    ).toBe(false);
    expect(JSON.stringify(natural)).toBe(before);
    const entry = vCarveFinishPaths(
        [
            {
                points: [
                    { x: 40, y: 40, z: 0 },
                    { x: 40, y: 40, z: -40 },
                    { x: 80, y: 80, z: 0 },
                ],
            },
        ],
        [rect(0, 0, 80, 80)],
        3,
        3,
        90,
        12,
    );
    expect(
        entry.flatMap((p) => p.points).some((p) => p.x === 40 && p.y === 40),
    ).toBe(false);
});
test('clearing leaves the V-bit bevel and expands holes away from the endmill', () => {
    const region = vCarveClearingRegion(loops, 3, 90, 12);
    expect(region).toHaveLength(2);
    const coordinates = region.flat();
    expect(Math.min(...coordinates.map((p: { x: number }) => p.x))).toBeCloseTo(
        3,
        3,
    );
    expect(Math.max(...coordinates.map((p: { x: number }) => p.x))).toBeCloseTo(
        77,
        3,
    );
    const config = makeToolpathConfig({
        operation: 'pocket',
        toolDiameter: 4,
        cutDepth: 3,
        passDepth: 1,
        tabHeight: 0,
        vCarveInset: { depth: 3, angle: 90, diameter: 12 },
    });
    const t = createToolpathFromLoops(loops, config);
    expect(Math.min(...t.previewContours.flat().map((p) => p.x))).toBeCloseTo(
        5,
        3,
    );
    expect(t.passDepths).toEqual([-1, -2, -3]);
    expect(t.sourceLoops).toHaveLength(2);
    expect(t.vCarveInset.depth).toBe(3);
    expect(
        buildGcode({
            toolpaths: [t],
            fileName: 'test',
            forcePolylineArcs: true,
        }),
    ).toContain('Z-3');
    expect(() =>
        buildGcode({
            toolpaths: [{ ...t, cutDepth: 4 }],
            fileName: 'test',
            forcePolylineArcs: true,
        }),
    ).toThrow('Clearing depth');
});
test('rejects open shapes, excessive cone depth, absent flat areas and depth mismatch', () => {
    expect(() =>
        vCarveClearingRegion(
            [
                {
                    points: [
                        { x: 0, y: 0 },
                        { x: 20, y: 0 },
                        { x: 20, y: 20 },
                    ],
                },
            ],
            3,
            90,
            12,
        ),
    ).toThrow('closed');
    expect(() => vCarveClearingRegion(loops, 7, 90, 12)).toThrow('too narrow');
    expect(() => vCarveClearingRegion([rect(0, 0, 4, 4)], 3, 90, 12)).toThrow(
        'unnecessary',
    );
    expect(() =>
        createToolpathFromLoops(
            loops,
            makeToolpathConfig({
                operation: 'pocket',
                toolDiameter: 4,
                cutDepth: 4,
                vCarveInset: { depth: 3, angle: 90, diameter: 12 },
            }),
        ),
    ).toThrow('match');
});
