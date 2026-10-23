import {
    buildClearingPaths,
    buildClearingPathsAsync,
    buildRasterPaths,
    buildRasterPathsAsync,
    buildSurfaceBoundaryPaths,
    buildSurfaceBoundaryPathsAsync,
    buildWaterlinePathsAsync,
    cutterContactHeight,
    orientSurfaceMesh,
    parseObj,
    parseStl,
    rasterizeTopSurface,
    type HeightField,
} from './surface-cam';

function rampMesh() {
    const vertices = new Float32Array([
        0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0,
    ]);
    return {
        vertices,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
        sourceName: 'ramp.stl',
    };
}

test('parses binary STL triangles and calculates bounds', () => {
    const buffer = new ArrayBuffer(134);
    const view = new DataView(buffer);
    view.setUint32(80, 1, true);
    const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 2];
    triangle.forEach((value, index) =>
        view.setFloat32(96 + index * 4, value, true),
    );
    const mesh = parseStl(buffer, 'test.stl');
    expect(mesh.vertices).toHaveLength(9);
    expect(mesh.bounds).toEqual({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 1,
        maxZ: 2,
    });
    expect(mesh.sourceName).toBe('test.stl');
});

test('parses OBJ quads, slash-separated face references, and negative vertex indices', () => {
    const mesh = parseObj(
        [
            'v 0 0 0',
            'v 2 0 0',
            'v 2 1 1',
            'v 0 1 1',
            'vt 0 0',
            'vn 0 0 1',
            'f -4/1/1 -3/1/1 -2/1/1 -1/1/1',
        ].join('\n'),
        'quad.obj',
    );
    expect(mesh.vertices).toHaveLength(18);
    expect(mesh.bounds).toEqual({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 2,
        maxY: 1,
        maxZ: 1,
    });
    expect(mesh.sourceName).toBe('quad.obj');
    expect(rasterizeTopSurface(mesh, 0.25).covered.some(Boolean)).toBe(true);
});

test('triangulates a concave OBJ polygon without filling its notch', () => {
    const mesh = parseObj(
        [
            'v 0 0 0',
            'v 2 0 0',
            'v 2 1 0',
            'v 1 1 0',
            'v 1 2 0',
            'v 0 2 0',
            'f 1 2 3 4 5 6',
        ].join('\n'),
    );
    let area = 0;
    for (let index = 0; index < mesh.vertices.length; index += 9) {
        const ax = mesh.vertices[index],
            ay = mesh.vertices[index + 1];
        const bx = mesh.vertices[index + 3],
            by = mesh.vertices[index + 4];
        const cx = mesh.vertices[index + 6],
            cy = mesh.vertices[index + 7];
        area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    }
    expect(mesh.vertices).toHaveLength(36);
    expect(area).toBeCloseTo(3);
    const field = rasterizeTopSurface(mesh, 0.25);
    const notchIndex = 6 * field.columns + 6;
    expect(field.covered[notchIndex]).toBe(0);
});

test('accepts a valid planar STL with zero thickness', () => {
    const vertices = new Float32Array([
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const planar = {
        vertices,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
        sourceName: 'plane.stl',
    };
    expect(rasterizeTopSurface(planar, 0.25).covered.some(Boolean)).toBe(true);
});

test('allows an edge-on source projection to be reoriented into a machinable top view', () => {
    const verticalFace = {
        vertices: new Float32Array([
            0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1,
        ]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 1 },
        sourceName: 'edge-on.stl',
    };
    const defaultSetup = orientSurfaceMesh(verticalFace, [0, 0, 1]);
    expect(() => rasterizeTopSurface(defaultSetup, 0.1)).toThrow(
        /projects the model edge-on/,
    );
    const selectedSetup = orientSurfaceMesh(verticalFace, [1, 0, 0]);
    expect(selectedSetup.bounds.maxX).toBeGreaterThan(
        selectedSetup.bounds.minX,
    );
    expect(selectedSetup.bounds.maxY).toBeGreaterThan(
        selectedSetup.bounds.minY,
    );
    expect(rasterizeTopSurface(selectedSetup, 0.1).covered.some(Boolean)).toBe(
        true,
    );
});

test('rasterizes a single-valued sloped surface with explicit uncovered cells', () => {
    const field = rasterizeTopSurface(rampMesh(), 0.25);
    expect(field.columns).toBe(5);
    expect(field.rows).toBe(5);
    expect(field.covered[field.rows * 2 + 2]).toBe(1);
    expect(field.heights[field.rows * 2 + 2]).toBeCloseTo(0.625);
});

test('uses the top-down geometric envelope even when the STL triangle winding is reversed', () => {
    const ramp = rampMesh();
    const reversed = new Float32Array(ramp.vertices.length);
    for (let index = 0; index < ramp.vertices.length; index += 9) {
        reversed.set(ramp.vertices.subarray(index, index + 3), index);
        reversed.set(ramp.vertices.subarray(index + 6, index + 9), index + 3);
        reversed.set(ramp.vertices.subarray(index + 3, index + 6), index + 6);
    }
    const field = rasterizeTopSurface({ ...ramp, vertices: reversed }, 0.25);
    expect(field.covered).toEqual(rasterizeTopSurface(ramp, 0.25).covered);
    expect(
        Array.from(field.heights, (height) =>
            Number.isFinite(height) ? height : null,
        ),
    ).toEqual(
        Array.from(rasterizeTopSurface(ramp, 0.25).heights, (height) =>
            Number.isFinite(height) ? height : null,
        ),
    );
});

test('conservative cell raster captures a narrow overhang between height samples', () => {
    const triangle = {
        vertices: new Float32Array([0.1, 0.1, 4, 0.2, 0.1, 4, 0.15, 0.2, 4]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 4 },
        sourceName: 'sub-cell-overhang.stl',
    };
    const field = rasterizeTopSurface(triangle, 0.5);
    expect(field.covered[0]).toBe(1);
    expect(field.heights[0]).toBeCloseTo(4);
    expect(
        cutterContactHeight(field, 0, 0, 'flat', 0.6),
    ).toBeGreaterThanOrEqual(4);
});

test('drapes the machining envelope across overhangs using only the uppermost surface', () => {
    const ramp = rampMesh();
    const lower = Array.from(ramp.vertices);
    const upper = Array.from(ramp.vertices).map((value, index) =>
        index % 3 === 2 ? value + 2 : value,
    );
    const vertices = new Float32Array([...lower, ...upper]);
    const field = rasterizeTopSurface(
        {
            vertices,
            bounds: { ...ramp.bounds, maxZ: 3 },
            sourceName: 'overhang.stl',
        },
        0.25,
    );
    expect(field.heights[field.columns * 2 + 2]).toBeCloseTo(2.625);
    expect(field.covered[field.columns * 2 + 2]).toBe(1);
});

test('traces a closed perimeter and interior hole contour for surface finishing', () => {
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 };
    const field: HeightField = {
        bounds,
        cellSize: 0.25,
        columns: 5,
        rows: 5,
        heights: new Float32Array(25),
        covered: new Uint8Array(25).fill(1),
    };
    field.covered[2 * field.columns + 2] = 0;
    field.heights[2 * field.columns + 2] = Number.NaN;
    const paths = buildSurfaceBoundaryPaths(field, {
        cutter: 'ball',
        toolDiameterMm: 0.4,
        stepoverMm: 0.2,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    });
    expect(paths).toHaveLength(2);
    for (const path of paths) {
        expect(path.length).toBeGreaterThan(4);
        expect(path[0].x).toBeCloseTo(path[path.length - 1].x);
        expect(path[0].y).toBeCloseTo(path[path.length - 1].y);
        expect(
            path.every(
                ({ x, y, z }) =>
                    x >= bounds.minX &&
                    x <= bounds.maxX &&
                    y >= bounds.minY &&
                    y <= bounds.maxY &&
                    Number.isFinite(z),
            ),
        ).toBe(true);
    }
});

test('keeps diagonally touching supported islands as separate closed contours', () => {
    const field: HeightField = {
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0.25, maxY: 0.25, maxZ: 0 },
        cellSize: 0.25,
        columns: 2,
        rows: 2,
        heights: new Float32Array([0, Number.NaN, Number.NaN, 0]),
        covered: new Uint8Array([1, 0, 0, 1]),
    };
    const paths = buildSurfaceBoundaryPaths(field, {
        cutter: 'ball',
        toolDiameterMm: 0.4,
        stepoverMm: 0.2,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    });
    expect(paths).toHaveLength(2);
    expect(
        paths.every(
            (path) =>
                path[0].x === path[path.length - 1].x &&
                path[0].y === path[path.length - 1].y,
        ),
    ).toBe(true);
});

test('bounds pathological perimeter complexity instead of exhausting browser memory', () => {
    const columns = 512;
    const rows = 512;
    const covered = new Uint8Array(columns * rows);
    for (let row = 0; row < rows; row += 1)
        for (let column = 0; column < columns; column += 1)
            covered[row * columns + column] = (row + column) % 2;
    const field: HeightField = {
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
        cellSize: 1 / (columns - 1),
        columns,
        rows,
        heights: new Float32Array(columns * rows),
        covered,
    };
    expect(() =>
        buildSurfaceBoundaryPaths(field, {
            cutter: 'ball',
            toolDiameterMm: 0.1,
            stepoverMm: 0.1,
            stepdownMm: 1,
            safeZMm: 5,
            stockTopZMm: 0,
        }),
    ).toThrow(/boundary is too complex/);
});

test('cancels while scanning a large surface boundary mask', async () => {
    const columns = 128;
    const rows = 128;
    const field: HeightField = {
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 127, maxY: 127, maxZ: 0 },
        cellSize: 1,
        columns,
        rows,
        heights: new Float32Array(columns * rows),
        covered: new Uint8Array(columns * rows).fill(1),
    };
    const controller = new AbortController();
    const pending = buildSurfaceBoundaryPathsAsync(
        field,
        {
            cutter: 'ball',
            toolDiameterMm: 1,
            stepoverMm: 1,
            stepdownMm: 1,
            safeZMm: 5,
            stockTopZMm: 0,
        },
        controller.signal,
    );
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

test('upper envelope is independent of how far apart overlapping layers are', () => {
    const ramp = rampMesh();
    const vertices = new Float32Array([
        ...ramp.vertices,
        ...Array.from(ramp.vertices, (value, index) =>
            index % 3 === 2 ? value + 0.1 : value,
        ),
    ]);
    const field = rasterizeTopSurface(
        {
            vertices,
            bounds: { ...ramp.bounds, maxZ: 1.1 },
            sourceName: 'shallow-overlap.stl',
        },
        0.25,
    );
    expect(field.heights[field.columns * 2 + 2]).toBeCloseTo(0.725);
});

test('ball-nose tip compensation follows flat and sloped target surfaces', () => {
    const flatField = rasterizeTopSurface(
        {
            vertices: new Float32Array([
                0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
            ]),
            bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
            sourceName: 'flat.stl',
        },
        0.125,
    );
    expect(
        cutterContactHeight(flatField, 0.5, 0.5, 'ballnose', 0.5),
    ).toBeCloseTo(0);

    const field = rasterizeTopSurface(rampMesh(), 0.125);
    const flat = cutterContactHeight(field, 0.5, 0.5, 'flat', 0.5);
    const ball = cutterContactHeight(field, 0.5, 0.5, 'ball', 0.5);
    expect(ball).toBeLessThan(flat);
});

test('builds conservative waterline contour bands and retains the surface perimeter', async () => {
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 4, maxY: 4, maxZ: 2 };
    const field: HeightField = {
        bounds,
        cellSize: 1,
        columns: 5,
        rows: 5,
        heights: new Float32Array([
            0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 2, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0,
            0, 0,
        ]),
        covered: new Uint8Array(25).fill(1),
    };
    const paths = await buildWaterlinePathsAsync(field, field.heights, {
        cutter: 'ball',
        toolDiameterMm: 0.5,
        stepoverMm: 0.5,
        stepdownMm: 0.5,
        safeZMm: 5,
        stockTopZMm: 0,
    });
    expect(paths.length).toBeGreaterThan(1);
    expect(
        paths.some(
            (path) =>
                path[0].x === path[path.length - 1].x &&
                path[0].y === path[path.length - 1].y,
        ),
    ).toBe(true);
    expect(
        paths.flat().every(({ x, y, z }) => Number.isFinite(x + y + z)),
    ).toBe(true);
});

test('waterline contour generation responds to cancellation between bands', async () => {
    const columns = 64;
    const rows = 64;
    const heights = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row += 1)
        for (let column = 0; column < columns; column += 1)
            heights[row * columns + column] = (column + row) / (columns + rows);
    const field: HeightField = {
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 63, maxY: 63, maxZ: 1 },
        cellSize: 1,
        columns,
        rows,
        heights,
        covered: new Uint8Array(columns * rows).fill(1),
    };
    const controller = new AbortController();
    await expect(
        buildWaterlinePathsAsync(
            field,
            heights,
            {
                cutter: 'ball',
                toolDiameterMm: 0.5,
                stepoverMm: 0.5,
                stepdownMm: 0.05,
                safeZMm: 5,
                stockTopZMm: 0,
            },
            controller.signal,
            () => controller.abort(),
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
});

test('creates connected alternating raster lines only over supported cells', () => {
    const field = rasterizeTopSurface(rampMesh(), 0.25);
    const contact = Float32Array.from(field.heights);
    const paths = buildRasterPaths(field, contact, {
        cutter: 'ballnose',
        toolDiameterMm: 2,
        stepoverMm: 0.25,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    });
    expect(paths.length).toBeGreaterThan(1);
    expect(paths[0][0].x).toBeLessThan(paths[0][paths[0].length - 1].x);
    expect(paths[1][0].x).toBeGreaterThan(paths[1][paths[1].length - 1].x);
});

test('splits finish passes at every unsupported gap instead of cutting across it', () => {
    const field = rasterizeTopSurface(rampMesh(), 0.25);
    const contact = Float32Array.from(field.heights);
    const gapRow = 2;
    field.covered[gapRow * field.columns + 2] = 0;
    const paths = buildRasterPaths(field, contact, {
        cutter: 'ball',
        toolDiameterMm: 0.5,
        stepoverMm: 0.25,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    });
    const crossing = paths.filter((path) => path[0].y === 0.5);
    expect(crossing).toHaveLength(2);
    expect(crossing.every((path) => path.length === 2)).toBe(true);
});

test('includes the far mesh boundary row in clearing and finish rasters when stepover does not divide the width', async () => {
    const field = rasterizeTopSurface(
        {
            vertices: new Float32Array([
                0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
            ]),
            bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
            sourceName: 'boundary-plane.stl',
        },
        0.2,
    );
    const finishHeights = Float32Array.from(field.heights, (height, index) =>
        field.covered[index] ? height : Number.NaN,
    );
    const clearHeights = Float32Array.from(field.heights, (_, index) =>
        field.covered[index] ? -1 : Number.NaN,
    );
    const finishOptions = {
        cutter: 'ball' as const,
        toolDiameterMm: 0.2,
        stepoverMm: 0.6,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    };
    const clearOptions = {
        ...finishOptions,
        cutter: 'flat' as const,
        stockTopZMm: 0,
    };
    const rowsFor = (paths: ReturnType<typeof buildRasterPaths>) =>
        Array.from(new Set(paths.map((path) => path[0].y.toFixed(3))));

    const syncFinish = buildRasterPaths(field, finishHeights, finishOptions);
    const asyncFinish = await buildRasterPathsAsync(
        field,
        finishHeights,
        finishOptions,
    );
    const syncClear = buildClearingPaths(field, clearHeights, clearOptions);
    const asyncClear = await buildClearingPathsAsync(
        field,
        clearHeights,
        clearOptions,
    );
    expect(rowsFor(syncFinish)).toEqual(['0.000', '0.600', '1.000']);
    expect(rowsFor(asyncFinish)).toEqual(rowsFor(syncFinish));
    expect(rowsFor(syncClear)).toEqual(['0.000', '0.600', '1.000']);
    expect(rowsFor(asyncClear)).toEqual(rowsFor(syncClear));
});

test('async finish path builder matches reference paths and yields to cancellation', async () => {
    const field = rasterizeTopSurface(rampMesh(), 0.025);
    const contact = Float32Array.from(field.heights);
    const options = {
        cutter: 'ball' as const,
        toolDiameterMm: 0.25,
        stepoverMm: 0.025,
        stepdownMm: 1,
        safeZMm: 5,
        stockTopZMm: 0,
    };
    const syncPaths = buildRasterPaths(field, contact, options);
    const asyncPaths = await buildRasterPathsAsync(field, contact, options);
    expect(asyncPaths).toEqual(syncPaths);

    const controller = new AbortController();
    await expect(
        buildRasterPathsAsync(field, contact, options, controller.signal, () =>
            controller.abort(),
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
});

test('async clearing path builder matches reference paths and yields to cancellation', async () => {
    const field = rasterizeTopSurface(rampMesh(), 0.025);
    const contact = Float32Array.from(field.heights);
    const options = {
        cutter: 'flat' as const,
        toolDiameterMm: 0.25,
        stepoverMm: 0.025,
        stepdownMm: 0.2,
        safeZMm: 5,
        stockTopZMm: 1,
    };
    const syncPaths = buildClearingPaths(field, contact, options);
    const asyncPaths = await buildClearingPathsAsync(field, contact, options);
    expect(asyncPaths).toEqual(syncPaths);

    const controller = new AbortController();
    await expect(
        buildClearingPathsAsync(
            field,
            contact,
            options,
            controller.signal,
            () => controller.abort(),
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
});

test('off-grid cutter queries include adjacent cell footprints before rounding', () => {
    const field: HeightField = {
        bounds: { minX: 0, maxX: 2, minY: 0, maxY: 0, minZ: 0, maxZ: 5 },
        cellSize: 1,
        columns: 3,
        rows: 1,
        heights: new Float32Array([0, 5, 0]),
        covered: new Uint8Array([1, 1, 1]),
    };
    expect(cutterContactHeight(field, 0.49, 0, 'flat', 0.2)).toBe(5);
});
