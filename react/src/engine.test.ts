/**
 * Tests: real pipeline emits gCAM GRBL for a profiled square; real pipeline rejects empty selection; vcarve without a worker rejects instead of hanging; combineToolpaths merges two ops into one program; and related cases.
 */
import {
    buildProfileGcode,
    buildSurfaceToolpathResult,
    buildToolpathGcode,
    combineToolpaths,
} from './lib/engine';
import { createToolpathFromLoops } from './cam/cam-ops.js';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];

test('real pipeline emits gCAM GRBL for a profiled square', async () => {
    const g = await buildProfileGcode({
        loops: [{ points: SQUARE }],
        toolDiameter: 6,
        cutDepth: 3,
        fileName: 'test',
    });
    expect(g).toContain('(gCAM GRBL output)');
    // offset square corner at -3,-3 with a 6mm tool
    expect(g).toContain('X-3');
    expect(g).toContain('M3');
    expect(g.trim().endsWith('M30')).toBe(true);
});

test('real pipeline rejects empty selection', async () => {
    await expect(
        buildProfileGcode({ loops: [], toolDiameter: 6, cutDepth: 3 }),
    ).rejects.toThrow(/No shapes/);
});

test('3D surface results emit XYZ finishing moves through the shared GRBL program', () => {
    const result = buildSurfaceToolpathResult({
        operation: 'surface-finish',
        paths: [
            [
                { x: 1, y: 2, z: -0.5 },
                { x: 3, y: 4, z: -1.25 },
            ],
        ],
        toolDiameter: 3,
        cutterType: 'ballnose',
        libraryToolId: 'catalog:ball-3mm',
        toolNumber: 3,
        feedRate: 1200,
        plungeRate: 300,
        spindle: 18000,
        safeZ: 5,
        stepdown: 1,
        stockToLeave: 0,
        surfaceBitmapId: 'surface-1',
    });
    expect(result.gcode).toContain(
        '(3D Surface Finishing - 3D Surface Finishing)',
    );
    expect(result.gcode).toContain('T3');
    expect(result.gcode).toContain('G1 Z-0.5');
    expect(result.gcode).toContain('G1 X3 Y4 Z-1.25');
    expect(result.gcode.trim().endsWith('M30')).toBe(true);
    expect(result.toolpath.emission).toBe('vcarve');
});

test('3D waterline contours package as ball-tip XYZ moves', () => {
    const result = buildSurfaceToolpathResult({
        operation: 'surface-waterline',
        paths: [
            [
                { x: 1, y: 2, z: -0.5 },
                { x: 1.5, y: 2.5, z: -0.75 },
            ],
        ],
        toolDiameter: 3,
        cutterType: 'ballnose',
        libraryToolId: 'catalog:ball-3mm',
        toolNumber: 3,
        feedRate: 1200,
        plungeRate: 300,
        spindle: 18000,
        safeZ: 5,
        stepdown: 0.5,
        stockToLeave: 0,
        surfaceBitmapId: 'surface-1',
    });
    expect(result.label).toBe('3D Waterline Finishing');
    expect(result.gcode).toContain('G1 X1.5 Y2.5 Z-0.75');
    expect(result.toolpath.surfaceTip).toBe(true);
});

test('vcarve without a worker rejects instead of hanging', async () => {
    await expect(
        buildToolpathGcode({
            loops: [{ points: SQUARE }],
            operation: 'vcarve',
            toolDiameter: 6,
            cutDepth: 3,
        }),
    ).rejects.toThrow();
});

test('combineToolpaths merges two ops into one program', () => {
    const mk = (operation: 'profile-outside' | 'pocket') =>
        createToolpathFromLoops([{ points: SQUARE }], {
            operation,
            toolDiameter: 6,
            toolRadius: 3,
            cutterAngle: 90,
            overlapPercent: 40,
            cutDepth: 3,
            passDepth: 3,
            trochoidEnabled: false,
            trochoidRadius: 0,
            trochoidEngagementPercent: 10,
            tabWidth: 9,
            tabHeight: 0,
            safeZ: 5,
            feedRate: 1800,
            plungeRate: 600,
            spindle: 18000,
            toolNumber: 1,
        });
    const g = combineToolpaths([
        mk('profile-outside') as unknown as Record<string, unknown>,
        mk('pocket') as unknown as Record<string, unknown>,
    ]);
    expect(g).toContain('Profile Outside');
    expect(g).toContain('Pocket');
    expect(g.trim().endsWith('M30')).toBe(true);
});

test('per-toolpath overrides flow into the program', async () => {
    const r = await buildToolpathGcode({
        loops: [{ points: SQUARE }],
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
        toolNumber: 2,
        tabWidth: 12,
        overlapPercent: 55,
        wavyFeed: 1500,
        fileName: 'test',
    });
    expect(r.toolpath).toMatchObject({ toolNumber: 2, tabWidth: 12 });
    expect(r.gcode).toContain('T2');
});
