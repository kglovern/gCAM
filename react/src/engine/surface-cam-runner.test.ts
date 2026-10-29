import {
    generateSurfaceCamPaths,
    validateSurfacePathsForStock,
} from './surface-cam-runner';
import {
    applySurfaceBoundaryOverrun,
    parseStl,
    type SurfaceMesh,
} from './surface-cam';
import { buildSurfaceToolpathResult } from '../lib/engine';
// @ts-expect-error Node typings are intentionally excluded from the browser app tsconfig.
import { readFileSync } from 'node:fs';

const suppliedStlPath = (
    globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
    }
).process?.env?.GCAM_SURFACE_STL_FIXTURE;
const suppliedFixtureTest = suppliedStlPath ? test : test.skip;

test('boundary overrun extends raster ends and adds passes beyond both Y edges without mutating source paths', () => {
    const source = [
        [
            { x: 2, y: 1, z: -1 },
            { x: 8, y: 1, z: -1 },
        ],
        [
            { x: 2, y: 2, z: -2 },
            { x: 8, y: 2, z: -2 },
        ],
    ];
    const result = applySurfaceBoundaryOverrun(source, 1);
    expect(result).toHaveLength(4);
    expect(result[0][0].x).toBe(1);
    expect(result[0][1].x).toBe(9);
    expect(result[2].map(({ y }) => y)).toEqual([0, 0]);
    expect(result[3].map(({ y }) => y)).toEqual([3, 3]);
    expect(source[0].map(({ x }) => x)).toEqual([2, 8]);
});

test('rejects an oversized WebGPU contact query before allocation', async () => {
    const mesh = {
        vertices: new Float32Array([
            10, 10, 0, 11, 10, 0, 11, 11, 0, 10, 10, 0, 11, 11, 0, 10, 11, 0,
        ]),
        bounds: { minX: 10, minY: 10, minZ: 0, maxX: 11, maxY: 11, maxZ: 0.1 },
        sourceName: 'plane.stl',
    };
    await expect(
        generateSurfaceCamPaths(mesh, {
            strategy: 'surface-finish',
            cutter: 'ball',
            toolDiameterMm: 6,
            stepoverMm: 0.2,
            stepdownMm: 1,
            safeZMm: 5,
            stockTopZMm: 0,
            stock: { widthMm: 100, heightMm: 100, thicknessMm: 18 },
            resolutionMm: 0.001,
        }),
    ).rejects.toThrow(/oversized WebGPU contact query/);
});

test('requires the machining grid to resolve the requested stepover', async () => {
    const mesh = {
        vertices: new Float32Array([2, 2, 0, 3, 2, 0, 3, 3, 0]),
        bounds: { minX: 2, minY: 2, minZ: 0, maxX: 3, maxY: 3, maxZ: 0 },
        sourceName: 'plane.stl',
    };
    await expect(
        generateSurfaceCamPaths(mesh, {
            strategy: 'surface-finish',
            cutter: 'ball',
            toolDiameterMm: 0.5,
            stepoverMm: 0.1,
            stepdownMm: 1,
            safeZMm: 5,
            stockTopZMm: 0,
            stock: { widthMm: 10, heightMm: 10, thicknessMm: 18 },
            resolutionMm: 0.25,
        }),
    ).rejects.toThrow(/grid resolution must be no larger than stepover/);
});

test('rejects a pre-cancelled surface CAM request before raster work starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const mesh = {
        vertices: new Float32Array([2, 2, 0, 3, 2, 0, 3, 3, 0]),
        bounds: { minX: 2, minY: 2, minZ: 0, maxX: 3, maxY: 3, maxZ: 0 },
        sourceName: 'plane.stl',
    };
    await expect(
        generateSurfaceCamPaths(
            mesh,
            {
                strategy: 'surface-finish',
                cutter: 'ball',
                toolDiameterMm: 0.5,
                stepoverMm: 0.2,
                stepdownMm: 1,
                safeZMm: 5,
                stockTopZMm: 0,
                stock: { widthMm: 10, heightMm: 10, thicknessMm: 18 },
                resolutionMm: 0.1,
            },
            undefined,
            controller.signal,
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
});

test.each([
    { strategy: 'surface-clear' as const, cutter: 'flat' as const },
    { strategy: 'surface-finish' as const, cutter: 'ball' as const },
    { strategy: 'surface-waterline' as const, cutter: 'ball' as const },
])(
    'generates supported $strategy moves using exact CPU fallback',
    async ({ strategy, cutter }) => {
        const mesh = {
            vertices: new Float32Array([
                2, 2, 0, 3, 2, -1, 3, 3, -1, 2, 2, 0, 3, 3, -1, 2, 3, 0,
            ]),
            bounds: { minX: 2, minY: 2, minZ: -1, maxX: 3, maxY: 3, maxZ: 0 },
            sourceName: 'known-good-ramp.stl',
        };
        const result = await generateSurfaceCamPaths(mesh, {
            strategy,
            cutter,
            toolDiameterMm: 0.5,
            stepoverMm: 0.2,
            stepdownMm: 0.2,
            stockToLeaveMm: strategy === 'surface-clear' ? 0.1 : 0,
            safeZMm: 5,
            stockTopZMm: 0,
            stock: { widthMm: 10, heightMm: 10, thicknessMm: 18 },
            resolutionMm: 0.1,
        });
        expect(result.computeBackend).toBe('cpu');
        expect(result.rasterBackend).toBe('cpu');
        expect(result.paths.length).toBeGreaterThan(0);
        expect(
            result.paths
                .flat()
                .every((point) => Number.isFinite(point.x + point.y + point.z)),
        ).toBe(true);
        if (strategy !== 'surface-clear') {
            expect(
                result.paths.some((path) => {
                    const first = path[0];
                    const last = path[path.length - 1];
                    return (
                        Math.hypot(first.x - last.x, first.y - last.y) < 1e-9
                    );
                }),
            ).toBe(true);
        }
        expect(() =>
            validateSurfacePathsForStock(result.paths, {
                strategy,
                cutter,
                toolDiameterMm: 0.5,
                stepoverMm: 0.2,
                stepdownMm: 0.2,
                safeZMm: 5,
                stockTopZMm: 0,
                stock: { widthMm: 10, heightMm: 10, thicknessMm: 18 },
                resolutionMm: 0.1,
            }),
        ).not.toThrow();
    },
);

test.each([
    { strategy: 'surface-clear' as const, cutter: 'flat' as const },
    { strategy: 'surface-finish' as const, cutter: 'ball' as const },
    { strategy: 'surface-waterline' as const, cutter: 'ball' as const },
])(
    'drapes $strategy over an 8.093 mm separated partial overhang without following its hidden lower face',
    async ({ strategy, cutter }) => {
        const lowerLayer = [
            2, 2, -10.093, 3, 2, -10.093, 3, 3, -10.093, 2, 2, -10.093, 3, 3,
            -10.093, 2, 3, -10.093,
        ];
        // The upper roof covers only the center of the lower layer and slopes
        // from Z-2 to Z-3. This catches implementations that only special-case
        // coincident/full-size stacked planes.
        const upperRoof = [
            2.2, 2.2, -2, 2.8, 2.2, -3, 2.8, 2.8, -3, 2.2, 2.2, -2, 2.8, 2.8,
            -3, 2.2, 2.8, -2,
        ];
        const mesh = {
            vertices: new Float32Array([...lowerLayer, ...upperRoof]),
            bounds: {
                minX: 2,
                minY: 2,
                minZ: -10.093,
                maxX: 3,
                maxY: 3,
                maxZ: -2,
            },
            sourceName: 'partial-sloped-overhang.stl',
        };
        const result = await generateSurfaceCamPaths(mesh, {
            strategy,
            cutter,
            toolDiameterMm: 0.2,
            stepoverMm: 0.2,
            stepdownMm: 0.5,
            safeZMm: 5,
            stockTopZMm: 0,
            stock: { widthMm: 10, heightMm: 10, thicknessMm: 18 },
            resolutionMm: 0.1,
        });
        const underRoof = result.paths
            .flat()
            .filter(({ x, y }) =>
                strategy === 'surface-waterline'
                    ? x >= 2.2 && x <= 2.8 && y >= 2.2 && y <= 2.8
                    : x >= 2.4 && x <= 2.6 && y >= 2.3 && y <= 2.7,
            );
        expect(underRoof.length).toBeGreaterThan(0);
        // The upper roof is around Z-2.3..-2.7 here; generated passes must not
        // plunge down toward the hidden Z-10 face beneath it.
        expect(Math.min(...underRoof.map(({ z }) => z))).toBeGreaterThan(-5);
        expect(
            result.paths
                .flat()
                .every(({ x, y, z }) => Number.isFinite(x + y + z)),
        ).toBe(true);
    },
);

test('rejects machine-unsafe surface paths at stock edges, stock bottom, and safe Z', () => {
    const base = {
        strategy: 'surface-finish' as const,
        cutter: 'ball' as const,
        toolDiameterMm: 2,
        stepoverMm: 0.5,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
        stock: { widthMm: 10, heightMm: 10, thicknessMm: 2 },
        resolutionMm: 0.25,
    };
    expect(() =>
        validateSurfacePathsForStock([[{ x: 0.5, y: 5, z: -1 }]], base),
    ).toThrow(/outside the job stock/);
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 5, z: -2.1 }]], base),
    ).toThrow(/below the job stock bottom/);
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 5, z: -1 }]], {
            ...base,
            safeZMm: 0,
        }),
    ).toThrow(/Safe Z/);
});

test('checks configured X/Y/Z machine travel for cut points and the safe retract', () => {
    const request = {
        strategy: 'surface-finish' as const,
        cutter: 'ball' as const,
        toolDiameterMm: 2,
        stepoverMm: 0.5,
        stepdownMm: 1,
        safeZMm: 4,
        stockTopZMm: 0,
        stock: { widthMm: 10, heightMm: 10, thicknessMm: 4 },
        resolutionMm: 0.25,
        travelLimits: {
            maxXTravelMm: 6,
            maxYTravelMm: 6,
            minZTravelMm: -1.5,
            maxZTravelMm: 4,
        },
    };
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 5, z: -1 }]], request),
    ).not.toThrow();
    expect(() =>
        validateSurfacePathsForStock([[{ x: 6.1, y: 5, z: -1 }]], request),
    ).toThrow(/X moves exceed/);
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 6.1, z: -1 }]], request),
    ).toThrow(/Y moves exceed/);
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 5, z: -1.6 }]], request),
    ).toThrow(/below the configured/);
    expect(() =>
        validateSurfacePathsForStock([[{ x: 5, y: 5, z: -1 }]], {
            ...request,
            safeZMm: 4.1,
        }),
    ).toThrow(/including the safe retract/);
});

suppliedFixtureTest(
    'runs the supplied STL through clearing and finishing into GRBL G-code',
    async () => {
        const file = readFileSync(suppliedStlPath!);
        const buffer = file.buffer.slice(
            file.byteOffset,
            file.byteOffset + file.byteLength,
        ) as ArrayBuffer;
        const parsed = parseStl(buffer, 'supplied-surface-cam-fixture.stl');
        const margin = 5;
        const shiftX = margin - parsed.bounds.minX;
        const shiftY = margin - parsed.bounds.minY;
        const shiftZ = -parsed.bounds.maxZ;
        const fitZ = 18 / (parsed.bounds.maxZ - parsed.bounds.minZ);
        const vertices = new Float32Array(parsed.vertices.length);
        for (let index = 0; index < vertices.length; index += 3) {
            vertices[index] = parsed.vertices[index] + shiftX;
            vertices[index + 1] = parsed.vertices[index + 1] + shiftY;
            vertices[index + 2] = (parsed.vertices[index + 2] + shiftZ) * fitZ;
        }
        const mesh: SurfaceMesh = {
            vertices,
            bounds: {
                minX: margin,
                minY: margin,
                minZ: (parsed.bounds.minZ + shiftZ) * fitZ,
                maxX: parsed.bounds.maxX + shiftX,
                maxY: parsed.bounds.maxY + shiftY,
                maxZ: 0,
            },
            sourceName: parsed.sourceName,
        };
        const stock = {
            widthMm: mesh.bounds.maxX + margin,
            heightMm: mesh.bounds.maxY + margin,
            thicknessMm: 18,
        };
        for (const boundaryMode of ['model', 'rectangle'] as const) {
            for (const [strategy, cutter] of [
                ['surface-clear', 'flat'],
                ['surface-finish', 'ball'],
                ['surface-waterline', 'ball'],
            ] as const) {
                const result = await generateSurfaceCamPaths(mesh, {
                    strategy,
                    cutter,
                    toolDiameterMm: 2,
                    stepoverMm: 1,
                    stepdownMm: 2,
                    stockToLeaveMm: strategy === 'surface-clear' ? 0.25 : 0,
                    safeZMm: 5,
                    stockTopZMm: 0,
                    stock,
                    resolutionMm: 0.5,
                    boundaryMode,
                    boundaryMm: 1,
                });
                expect(result.paths.length).toBeGreaterThan(0);
                expect(result.coveredCells).toBeGreaterThan(0);
                expect(
                    result.paths.flat().every((point) => point.z >= -18),
                ).toBe(true);
                if (strategy !== 'surface-clear') {
                    expect(
                        result.paths.some((path) => {
                            const first = path[0];
                            const last = path[path.length - 1];
                            return (
                                Math.hypot(first.x - last.x, first.y - last.y) <
                                1e-9
                            );
                        }),
                    ).toBe(true);
                }
                const program = buildSurfaceToolpathResult({
                    operation: strategy,
                    paths: result.paths,
                    toolDiameter: 2,
                    cutterType: cutter === 'flat' ? 'flat' : 'ballnose',
                    libraryToolId: `fixture:${cutter}`,
                    toolNumber: 1,
                    feedRate: 800,
                    plungeRate: 200,
                    spindle: 18000,
                    safeZ: 5,
                    stepdown: 2,
                    stockToLeave: strategy === 'surface-clear' ? 0.25 : 0,
                    surfaceBitmapId: 'supplied-fixture',
                });
                expect(program.gcode).toContain('G1 X');
                expect(program.gcode).toContain('Z-');
                expect(program.gcode.trim().endsWith('M30')).toBe(true);
            }
        }
    },
    120_000,
);

test.each(['surface-clear', 'surface-finish', 'surface-waterline'] as const)(
    'rectangular %s with a fractional margin machines the surrounding base and preserves model top',
    async (strategy) => {
        const mesh: SurfaceMesh = {
            vertices: new Float32Array([4, 4, -2, 6, 4, -2, 5, 6, 0]),
            bounds: { minX: 4, minY: 4, minZ: -2, maxX: 6, maxY: 6, maxZ: 0 },
            sourceName: 'triangle.stl',
        };
        const result = await generateSurfaceCamPaths(mesh, {
            strategy,
            cutter: strategy === 'surface-clear' ? 'flat' : 'ball',
            toolDiameterMm: 0.2,
            stepoverMm: 0.2,
            stepdownMm: 0.5,
            resolutionMm: 0.1,
            boundaryMode: 'rectangle',
            boundaryMm: 0.35,
            safeZMm: 5,
            stockTopZMm: 0,
            stock: { widthMm: 10, heightMm: 10, thicknessMm: 4 },
        });
        const points = result.paths.flat();
        expect(points.length).toBeGreaterThan(0);
        expect(points.some(({ x, z }) => x < 4 && z < -1.5)).toBe(true);
        expect(points.some(({ z }) => z > -0.2)).toBe(true);
        expect(points.every(({ z }) => z >= -2.0001)).toBe(true);
        expect(mesh.vertices).toHaveLength(9);
    },
);

test('centred stock accepts negative cutter positions and still rejects edge overrun', () => {
    const request = {
        strategy: 'surface-finish' as const,
        cutter: 'ball' as const,
        toolDiameterMm: 2,
        stepoverMm: 1,
        stepdownMm: 1,
        resolutionMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
        stock: {
            widthMm: 100,
            heightMm: 100,
            thicknessMm: 18,
            origin: 'center' as const,
        },
        travelLimits: {
            maxXTravelMm: 100,
            maxYTravelMm: 100,
            minZTravelMm: -100,
            maxZTravelMm: 100,
        },
    };
    expect(() =>
        validateSurfacePathsForStock(
            [
                [
                    { x: -40, y: -40, z: -1 },
                    { x: 40, y: 40, z: -1 },
                ],
            ],
            request,
        ),
    ).not.toThrow();
    expect(() =>
        validateSurfacePathsForStock([[{ x: -50, y: 0, z: -1 }]], request),
    ).toThrow(/outside/);
});
