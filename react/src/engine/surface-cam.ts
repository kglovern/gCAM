/** Core geometry and scan-path utilities for 3-axis surface CAM. */
import { throwIfSurfaceCamAborted } from './surface-cam-cancel';

export interface SurfacePoint {
    x: number;
    y: number;
    z: number;
}

export interface SurfaceBounds {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
}

export interface SurfaceMesh {
    vertices: Float32Array;
    bounds: SurfaceBounds;
    sourceName: string;
}

export interface HeightField {
    bounds: SurfaceBounds;
    cellSize: number;
    columns: number;
    rows: number;
    heights: Float32Array;
    covered: Uint8Array;
}

export interface SurfacePathPoint extends SurfacePoint {
    rapid?: boolean;
}

export interface SurfacePathOptions {
    toolDiameterMm: number;
    stepoverMm: number;
    stepdownMm: number;
    stockToLeaveMm?: number;
    /** XY overrun beyond the rastered model footprint for rough/parallel finish passes. */
    boundaryMm?: number;
    boundaryMode?: 'model' | 'rectangle';
    safeZMm: number;
    stockTopZMm: number;
    cutter: 'flat' | 'ball' | 'ballnose';
    /** Center spacing for path sampling; defaults to the height-field cell size. */
    sampleStepMm?: number;
}

/** Extend only the outer ends and outermost rows of horizontal raster passes. */
export function applySurfaceBoundaryOverrun(
    paths: SurfacePathPoint[][],
    boundaryMm = 0,
): SurfacePathPoint[][] {
    if (!(boundaryMm > 0)) return paths;
    const extendedPaths = paths.map((path) =>
        path.map((point) => ({ ...point })),
    );
    const horizontal = extendedPaths.filter(
        (path) =>
            path.length >= 2 &&
            path.every((point) => Math.abs(point.y - path[0].y) < 1e-5),
    );
    if (!horizontal.length) return paths;
    const rows = new Map<number, SurfacePathPoint[][]>();
    for (const path of horizontal) {
        const key = Math.round(path[0].y * 100_000);
        const group = rows.get(key) ?? [];
        group.push(path);
        rows.set(key, group);
    }
    const rowGroups = [...rows.values()];
    for (const group of rowGroups) {
        const endpoints = group.flatMap((path) => [
            path[0],
            path[path.length - 1],
        ]);
        const minX = Math.min(...endpoints.map((point) => point.x));
        const maxX = Math.max(...endpoints.map((point) => point.x));
        for (const path of group) {
            for (const index of [0, path.length - 1]) {
                const point = path[index];
                if (Math.abs(point.x - minX) < 1e-5) {
                    const next = path[index === 0 ? 1 : index - 1];
                    const direction = Math.sign(point.x - next.x);
                    if (direction) point.x += direction * boundaryMm;
                }
                if (Math.abs(point.x - maxX) < 1e-5) {
                    const next = path[index === 0 ? 1 : index - 1];
                    const direction = Math.sign(point.x - next.x);
                    if (direction) point.x += direction * boundaryMm;
                }
            }
        }
    }
    const minY = Math.min(...rowGroups.map((group) => group[0][0].y));
    const maxY = Math.max(...rowGroups.map((group) => group[0][0].y));
    const lowest = rows.get(Math.round(minY * 100_000)) ?? [];
    const highest = rows.get(Math.round(maxY * 100_000)) ?? [];
    const overrunRows = [
        ...lowest.map((path) =>
            path.map((point) => ({ ...point, y: point.y - boundaryMm })),
        ),
    ];
    if (minY !== maxY)
        overrunRows.push(
            ...highest.map((path) =>
                path.map((point) => ({ ...point, y: point.y + boundaryMm })),
            ),
        );
    return [...extendedPaths, ...overrunRows];
}

const finite = (value: number) => Number.isFinite(value);

function boundsOf(vertices: Float32Array): SurfaceBounds {
    if (!vertices.length || vertices.length % 9 !== 0)
        throw new Error('The mesh contains no valid triangles.');
    const bounds: SurfaceBounds = {
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
    };
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const y = vertices[i + 1];
        const z = vertices[i + 2];
        if (![x, y, z].every(finite))
            throw new Error('The mesh contains a non-finite vertex.');
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
        bounds.maxZ = Math.max(bounds.maxZ, z);
    }
    return bounds;
}

/** Rotate a source mesh so a chosen source-space direction is the machining +Z axis. */
export function orientSurfaceMesh(
    mesh: SurfaceMesh,
    upDirection: readonly number[],
): SurfaceMesh {
    if (upDirection.length !== 3 || upDirection.some((value) => !finite(value)))
        throw new Error(
            'Machining up direction must contain three finite values.',
        );
    const length = Math.hypot(upDirection[0], upDirection[1], upDirection[2]);
    if (!(length > 1e-9))
        throw new Error('Machining up direction cannot be zero.');
    const up = upDirection.map((value) => value / length);
    const reference = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const cross = (a: number[], b: number[]) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const xAxisRaw = cross(reference, up);
    const xLength = Math.hypot(...xAxisRaw);
    const xAxis = xAxisRaw.map((value) => value / xLength);
    const yAxis = cross(up, xAxis);
    const vertices = new Float32Array(mesh.vertices.length);
    for (let index = 0; index < vertices.length; index += 3) {
        const point = [
            mesh.vertices[index],
            mesh.vertices[index + 1],
            mesh.vertices[index + 2],
        ];
        vertices[index] =
            point[0] * xAxis[0] + point[1] * xAxis[1] + point[2] * xAxis[2];
        vertices[index + 1] =
            point[0] * yAxis[0] + point[1] * yAxis[1] + point[2] * yAxis[2];
        vertices[index + 2] =
            point[0] * up[0] + point[1] * up[1] + point[2] * up[2];
    }
    return { ...mesh, vertices, bounds: boundsOf(vertices) };
}

/** Parse binary or ASCII STL, retaining triangles in their original coordinates. */
export function parseStl(
    buffer: ArrayBuffer,
    sourceName = 'model.stl',
): SurfaceMesh {
    if (buffer.byteLength < 15)
        throw new Error('The STL file is empty or incomplete.');
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const isBinary =
        buffer.byteLength >= 84 &&
        84 + triangleCount * 50 === buffer.byteLength;
    let vertices: Float32Array;
    if (isBinary) {
        if (!triangleCount) throw new Error('The STL contains no triangles.');
        vertices = new Float32Array(triangleCount * 9);
        let out = 0;
        for (let triangle = 0; triangle < triangleCount; triangle += 1) {
            const base = 84 + triangle * 50 + 12;
            for (let vertex = 0; vertex < 3; vertex += 1) {
                const offset = base + vertex * 12;
                vertices[out++] = view.getFloat32(offset, true);
                vertices[out++] = view.getFloat32(offset + 4, true);
                vertices[out++] = view.getFloat32(offset + 8, true);
            }
        }
    } else {
        const text = new TextDecoder().decode(buffer);
        const matches = text.matchAll(
            /\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gi,
        );
        const values: number[] = [];
        for (const match of matches)
            values.push(Number(match[1]), Number(match[2]), Number(match[3]));
        if (!values.length || values.length % 9 !== 0)
            throw new Error('Could not read triangles from the ASCII STL.');
        vertices = new Float32Array(values);
    }
    return { vertices, bounds: boundsOf(vertices), sourceName };
}

/** Parse a Wavefront OBJ mesh, triangulating polygon faces while preserving winding. */
export function parseObj(text: string, sourceName = 'model.obj'): SurfaceMesh {
    const positions: number[][] = [];
    const triangles: number[] = [];
    const triangulate = (face: number[]) => {
        const points = face.map((index) => positions[index]);
        const normal = [0, 0, 0];
        for (let index = 0; index < points.length; index += 1) {
            const current = points[index];
            const next = points[(index + 1) % points.length];
            normal[0] += (current[1] - next[1]) * (current[2] + next[2]);
            normal[1] += (current[2] - next[2]) * (current[0] + next[0]);
            normal[2] += (current[0] - next[0]) * (current[1] + next[1]);
        }
        const droppedAxis = normal.reduce(
            (best, value, index) =>
                Math.abs(value) > Math.abs(normal[best]) ? index : best,
            0,
        );
        if (Math.abs(normal[droppedAxis]) < 1e-12)
            throw new Error('The OBJ contains a degenerate polygon face.');
        const projected = points.map(([x, y, z]) =>
            droppedAxis === 0 ? [y, z] : droppedAxis === 1 ? [x, z] : [x, y],
        );
        const cross = (a: number[], b: number[], c: number[]) =>
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const area = projected.reduce((sum, point, index) => {
            const next = projected[(index + 1) % projected.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        const winding = Math.sign(area);
        if (!winding)
            throw new Error('The OBJ contains a degenerate polygon face.');
        const remaining = projected.map((_, index) => index);
        const insideTriangle = (
            point: number[],
            a: number[],
            b: number[],
            c: number[],
        ) =>
            cross(a, b, point) * winding >= -1e-10 &&
            cross(b, c, point) * winding >= -1e-10 &&
            cross(c, a, point) * winding >= -1e-10;
        while (remaining.length > 3) {
            let clipped = false;
            for (let cursor = 0; cursor < remaining.length; cursor += 1) {
                const previous =
                    remaining[
                        (cursor + remaining.length - 1) % remaining.length
                    ];
                const current = remaining[cursor];
                const next = remaining[(cursor + 1) % remaining.length];
                const a = projected[previous];
                const b = projected[current];
                const c = projected[next];
                if (cross(a, b, c) * winding <= 1e-12) continue;
                if (
                    remaining.some(
                        (candidate) =>
                            candidate !== previous &&
                            candidate !== current &&
                            candidate !== next &&
                            insideTriangle(projected[candidate], a, b, c),
                    )
                )
                    continue;
                for (const localIndex of [previous, current, next])
                    triangles.push(...points[localIndex]);
                remaining.splice(cursor, 1);
                clipped = true;
                break;
            }
            if (!clipped)
                throw new Error(
                    'The OBJ contains a polygon that could not be triangulated.',
                );
        }
        for (const localIndex of remaining)
            triangles.push(...points[localIndex]);
    };
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split('#', 1)[0].trim();
        if (!line) continue;
        const [record, ...values] = line.split(/\s+/);
        if (record === 'v') {
            if (values.length < 3) continue;
            const vertex = values.slice(0, 3).map(Number);
            if (!vertex.every(finite))
                throw new Error('The OBJ contains a non-finite vertex.');
            positions.push(vertex);
            continue;
        }
        if (record !== 'f') continue;
        if (values.length < 3)
            throw new Error(
                'The OBJ contains a face with fewer than three vertices.',
            );
        const face = values.map((token) => {
            const rawIndex = Number(token.split('/', 1)[0]);
            if (!Number.isInteger(rawIndex) || rawIndex === 0)
                throw new Error(
                    'The OBJ contains an invalid face vertex index.',
                );
            const index =
                rawIndex > 0 ? rawIndex - 1 : positions.length + rawIndex;
            if (index < 0 || index >= positions.length)
                throw new Error(
                    'The OBJ contains a face index outside its vertex list.',
                );
            return index;
        });
        triangulate(face);
    }
    if (!triangles.length)
        throw new Error('Could not read triangular faces from the OBJ.');
    const vertices = new Float32Array(triangles);
    return { vertices, bounds: boundsOf(vertices), sourceName };
}

function edge(a: SurfacePoint, b: SurfacePoint) {
    return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function interpolateHeight(
    a: SurfacePoint,
    b: SurfacePoint,
    c: SurfacePoint,
    x: number,
    y: number,
): number | null {
    const v0 = edge(a, c);
    const v1 = edge(a, b);
    const v2 = { x: x - a.x, y: y - a.y };
    const denominator = v0.x * v1.y - v1.x * v0.y;
    if (Math.abs(denominator) < 1e-12) return null;
    const u = (v2.x * v1.y - v1.x * v2.y) / denominator;
    const v = (v0.x * v2.y - v2.x * v0.y) / denominator;
    const epsilon = 1e-7;
    if (u < -epsilon || v < -epsilon || u + v > 1 + epsilon) return null;
    return a.z + u * (c.z - a.z) + v * (b.z - a.z);
}

function insideBox(
    point: SurfacePoint,
    left: number,
    bottom: number,
    right: number,
    top: number,
): boolean {
    const epsilon = 1e-9;
    return (
        point.x >= left - epsilon &&
        point.x <= right + epsilon &&
        point.y >= bottom - epsilon &&
        point.y <= top + epsilon
    );
}

function segmentBoxEdgeHeight(
    a: SurfacePoint,
    b: SurfacePoint,
    left: number,
    bottom: number,
    right: number,
    top: number,
    edgeName: 'left' | 'right' | 'bottom' | 'top',
): number | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const vertical = edgeName === 'left' || edgeName === 'right';
    const delta = vertical ? dx : dy;
    if (Math.abs(delta) < 1e-12) return null;
    const boundary =
        edgeName === 'left'
            ? left
            : edgeName === 'right'
              ? right
              : edgeName === 'bottom'
                ? bottom
                : top;
    const t = (boundary - (vertical ? a.x : a.y)) / delta;
    if (t < -1e-9 || t > 1 + 1e-9) return null;
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const withinOtherAxis = vertical
        ? y >= bottom - 1e-9 && y <= top + 1e-9
        : x >= left - 1e-9 && x <= right + 1e-9;
    return withinOtherAxis ? a.z + t * (b.z - a.z) : null;
}

/** Highest Z where a projected triangle intersects a square raster cell. */
function triangleCellMaximum(
    a: SurfacePoint,
    b: SurfacePoint,
    c: SurfacePoint,
    left: number,
    bottom: number,
    right: number,
    top: number,
): number | null {
    let maximum = Number.NEGATIVE_INFINITY;
    for (const vertex of [a, b, c])
        if (insideBox(vertex, left, bottom, right, top))
            maximum = Math.max(maximum, vertex.z);
    for (const [x, y] of [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
    ] as const) {
        const z = interpolateHeight(a, b, c, x, y);
        if (z !== null) maximum = Math.max(maximum, z);
    }
    const edges: Array<[SurfacePoint, SurfacePoint]> = [
        [a, b],
        [b, c],
        [c, a],
    ];
    for (const [start, end] of edges) {
        for (const edgeName of ['left', 'right', 'bottom', 'top'] as const) {
            const z = segmentBoxEdgeHeight(
                start,
                end,
                left,
                bottom,
                right,
                top,
                edgeName,
            );
            if (z !== null) maximum = Math.max(maximum, z);
        }
    }
    return finite(maximum) ? maximum : null;
}

/**
 * Rasterize every triangle into a conservative top-down envelope, independent
 * of triangle winding. At an overhang, retain the highest geometric surface
 * at each XY position: this deliberately drapes 3-axis paths over the upper
 * geometry rather than sending the cutter underneath it. Hidden lower
 * surfaces are not machined by this single-setup strategy.
 */
export function rasterizeTopSurface(
    mesh: SurfaceMesh,
    cellSizeMm: number,
): HeightField {
    if (!(cellSizeMm > 0) || !finite(cellSizeMm))
        throw new Error('Height-field resolution must be positive.');
    const { bounds, vertices } = mesh;
    if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY)
        throw new Error(
            'This setup direction projects the model edge-on. Choose a different machining setup direction.',
        );
    const columns = Math.ceil((bounds.maxX - bounds.minX) / cellSizeMm) + 1;
    const rows = Math.ceil((bounds.maxY - bounds.minY) / cellSizeMm) + 1;
    if (columns * rows > 16_000_000)
        throw new Error(
            'The requested mesh resolution exceeds the 16-million-cell safety limit. Increase cell size.',
        );
    const heights = new Float32Array(columns * rows);
    heights.fill(Number.NEGATIVE_INFINITY);
    const covered = new Uint8Array(columns * rows);
    for (let i = 0; i < vertices.length; i += 9) {
        const a = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
        const b = {
            x: vertices[i + 3],
            y: vertices[i + 4],
            z: vertices[i + 5],
        };
        const c = {
            x: vertices[i + 6],
            y: vertices[i + 7],
            z: vertices[i + 8],
        };
        const halfCell = cellSizeMm / 2;
        const minX = Math.max(
            0,
            Math.floor(
                (Math.min(a.x, b.x, c.x) - bounds.minX) / cellSizeMm - 0.5,
            ),
        );
        const maxX = Math.min(
            columns - 1,
            Math.ceil(
                (Math.max(a.x, b.x, c.x) - bounds.minX) / cellSizeMm + 0.5,
            ),
        );
        const minY = Math.max(
            0,
            Math.floor(
                (Math.min(a.y, b.y, c.y) - bounds.minY) / cellSizeMm - 0.5,
            ),
        );
        const maxY = Math.min(
            rows - 1,
            Math.ceil(
                (Math.max(a.y, b.y, c.y) - bounds.minY) / cellSizeMm + 0.5,
            ),
        );
        for (let row = minY; row <= maxY; row += 1) {
            const y = bounds.minY + row * cellSizeMm;
            for (let column = minX; column <= maxX; column += 1) {
                const x = bounds.minX + column * cellSizeMm;
                const z = triangleCellMaximum(
                    a,
                    b,
                    c,
                    x - halfCell,
                    y - halfCell,
                    x + halfCell,
                    y + halfCell,
                );
                if (z === null) continue;
                const index = row * columns + column;
                const highest = heights[index];
                if (!finite(highest)) {
                    heights[index] = z;
                } else if (z > highest) heights[index] = z;
                covered[index] = 1;
            }
        }
    }
    for (let i = 0; i < heights.length; i += 1)
        if (!covered[i]) heights[i] = Number.NaN;
    return { bounds, cellSize: cellSizeMm, columns, rows, heights, covered };
}

/** CPU reference cutter envelope used to verify the WebGPU worker output. */
export function cutterContactHeight(
    field: HeightField,
    x: number,
    y: number,
    cutter: SurfacePathOptions['cutter'],
    diameterMm: number,
    stockToLeaveMm = 0,
    guardMm = 0,
    verticalGuardMm = guardMm,
): number {
    const radius = diameterMm / 2;
    const ball = cutter === 'ball' || cutter === 'ballnose';
    let contact = Number.NEGATIVE_INFINITY;
    const halfCell = field.cellSize / 2;
    const reach = Math.ceil(
        (radius + guardMm + halfCell * Math.SQRT2) / field.cellSize,
    );
    const centerX = Math.round((x - field.bounds.minX) / field.cellSize);
    const centerY = Math.round((y - field.bounds.minY) / field.cellSize);
    for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
            const indexX = centerX + dx;
            const indexY = centerY + dy;
            if (
                indexX < 0 ||
                indexY < 0 ||
                indexX >= field.columns ||
                indexY >= field.rows
            )
                continue;
            const index = indexY * field.columns + indexX;
            if (!field.covered[index]) continue;
            const nearestX = Math.max(
                Math.abs(field.bounds.minX + indexX * field.cellSize - x) -
                    halfCell -
                    guardMm,
                0,
            );
            const nearestY = Math.max(
                Math.abs(field.bounds.minY + indexY * field.cellSize - y) -
                    halfCell -
                    guardMm,
                0,
            );
            const radial = Math.hypot(nearestX, nearestY);
            if (radial > radius) continue;
            const surfaceZ = field.heights[index];
            // G-code Z is the ball tip, not the sphere center. At a radial
            // offset the ball sits riseMm above its tip, so tip Z must be
            // target Z minus that rise to touch without gouging.
            const ballRise = ball
                ? radius -
                  Math.sqrt(Math.max(0, radius * radius - radial * radial))
                : 0;
            contact = Math.max(contact, surfaceZ - ballRise);
        }
    }
    if (!finite(contact))
        throw new Error(
            'Toolpath sample is outside the supported mesh surface.',
        );
    return contact + stockToLeaveMm + verticalGuardMm;
}

/** Scan regular stepover rows and always include the far projected boundary. */
export function rasterPathRows(rowCount: number, rowStep: number): number[] {
    const rows: number[] = [];
    for (let row = 0; row < rowCount; row += rowStep) rows.push(row);
    const lastRow = rowCount - 1;
    if (lastRow >= 0 && rows[rows.length - 1] !== lastRow) rows.push(lastRow);
    return rows;
}

interface SurfaceBoundaryEdge {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

const MAX_SURFACE_BOUNDARY_EDGES = 200_000;

function appendSurfaceBoundaryEdge(
    edges: SurfaceBoundaryEdge[],
    edge: SurfaceBoundaryEdge,
): void {
    if (edges.length >= MAX_SURFACE_BOUNDARY_EDGES)
        throw new Error(
            'The projected mesh boundary is too complex to finish at this grid resolution. Increase machining grid size or simplify the STL.',
        );
    edges.push(edge);
}

function surfaceBoundaryEdges(field: HeightField): SurfaceBoundaryEdge[] {
    const edges: SurfaceBoundaryEdge[] = [];
    const covered = (column: number, row: number) =>
        column >= 0 &&
        row >= 0 &&
        column < field.columns &&
        row < field.rows &&
        field.covered[row * field.columns + column] !== 0;
    const appendCell = (column: number, row: number) => {
        if (!covered(column, row)) return;
        // Counter-clockwise edges keep the supported surface on the left.
        if (!covered(column, row - 1))
            appendSurfaceBoundaryEdge(edges, {
                startX: column,
                startY: row,
                endX: column + 1,
                endY: row,
            });
        if (!covered(column + 1, row))
            appendSurfaceBoundaryEdge(edges, {
                startX: column + 1,
                startY: row,
                endX: column + 1,
                endY: row + 1,
            });
        if (!covered(column, row + 1))
            appendSurfaceBoundaryEdge(edges, {
                startX: column + 1,
                startY: row + 1,
                endX: column,
                endY: row + 1,
            });
        if (!covered(column - 1, row))
            appendSurfaceBoundaryEdge(edges, {
                startX: column,
                startY: row + 1,
                endX: column,
                endY: row,
            });
    };
    for (let row = 0; row < field.rows; row += 1) {
        for (let column = 0; column < field.columns; column += 1)
            appendCell(column, row);
    }
    return edges;
}

async function surfaceBoundaryEdgesAsync(
    field: HeightField,
    signal?: AbortSignal,
): Promise<SurfaceBoundaryEdge[]> {
    const edges: SurfaceBoundaryEdge[] = [];
    const covered = (column: number, row: number) =>
        column >= 0 &&
        row >= 0 &&
        column < field.columns &&
        row < field.rows &&
        field.covered[row * field.columns + column] !== 0;
    for (let row = 0; row < field.rows; row += 1) {
        throwIfSurfaceCamAborted(signal);
        for (let column = 0; column < field.columns; column += 1) {
            if (!covered(column, row)) continue;
            if (!covered(column, row - 1))
                appendSurfaceBoundaryEdge(edges, {
                    startX: column,
                    startY: row,
                    endX: column + 1,
                    endY: row,
                });
            if (!covered(column + 1, row))
                appendSurfaceBoundaryEdge(edges, {
                    startX: column + 1,
                    startY: row,
                    endX: column + 1,
                    endY: row + 1,
                });
            if (!covered(column, row + 1))
                appendSurfaceBoundaryEdge(edges, {
                    startX: column + 1,
                    startY: row + 1,
                    endX: column,
                    endY: row + 1,
                });
            if (!covered(column - 1, row))
                appendSurfaceBoundaryEdge(edges, {
                    startX: column,
                    startY: row + 1,
                    endX: column,
                    endY: row,
                });
            if (column > 0 && column % 16_384 === 0) {
                await yieldSurfacePathWork();
                throwIfSurfaceCamAborted(signal);
            }
        }
        if ((row + 1) % 32 === 0) await yieldSurfacePathWork();
    }
    throwIfSurfaceCamAborted(signal);
    return edges;
}

function surfaceBoundaryLoops(
    edges: SurfaceBoundaryEdge[],
): Array<Array<{ column: number; row: number }>> {
    const key = (column: number, row: number) => `${column},${row}`;
    const outgoing = new Map<string, number[]>();
    edges.forEach((edge, index) => {
        const start = key(edge.startX, edge.startY);
        const atStart = outgoing.get(start) ?? [];
        atStart.push(index);
        outgoing.set(start, atStart);
    });
    const used = new Uint8Array(edges.length);
    const loops: Array<Array<{ column: number; row: number }>> = [];
    const turnRank = (
        incoming: SurfaceBoundaryEdge,
        candidate: SurfaceBoundaryEdge,
    ) => {
        const inX = incoming.endX - incoming.startX;
        const inY = incoming.endY - incoming.startY;
        const outX = candidate.endX - candidate.startX;
        const outY = candidate.endY - candidate.startY;
        const cross = inX * outY - inY * outX;
        const dot = inX * outX + inY * outY;
        // At diagonal-touch junctions, prefer the tight left turn so separate
        // supported islands remain separate closed contours.
        return cross > 0 ? 0 : dot > 0 ? 1 : cross < 0 ? 2 : 3;
    };
    for (let first = 0; first < edges.length; first += 1) {
        if (used[first]) continue;
        const loop: Array<{ column: number; row: number }> = [];
        const origin = key(edges[first].startX, edges[first].startY);
        let current = first;
        let guard = 0;
        while (!used[current] && guard <= edges.length) {
            const edge = edges[current];
            used[current] = 1;
            loop.push({ column: edge.startX, row: edge.startY });
            const endKey = key(edge.endX, edge.endY);
            if (endKey === origin) {
                loop.push({ column: edge.endX, row: edge.endY });
                break;
            }
            const next = (outgoing.get(endKey) ?? [])
                .filter((index) => !used[index])
                .sort(
                    (a, b) =>
                        turnRank(edge, edges[a]) - turnRank(edge, edges[b]),
                )[0];
            if (next === undefined) break;
            current = next;
            guard += 1;
        }
        if (
            loop.length >= 5 &&
            loop[0].column === loop[loop.length - 1].column &&
            loop[0].row === loop[loop.length - 1].row
        )
            loops.push(loop);
    }
    return loops;
}

async function surfaceBoundaryLoopsAsync(
    edges: SurfaceBoundaryEdge[],
    signal?: AbortSignal,
): Promise<Array<Array<{ column: number; row: number }>>> {
    const key = (column: number, row: number) => `${column},${row}`;
    const outgoing = new Map<string, number[]>();
    for (let index = 0; index < edges.length; index += 1) {
        throwIfSurfaceCamAborted(signal);
        const edge = edges[index];
        const start = key(edge.startX, edge.startY);
        const atStart = outgoing.get(start) ?? [];
        atStart.push(index);
        outgoing.set(start, atStart);
        if (index > 0 && index % 16_384 === 0) await yieldSurfacePathWork();
    }
    const used = new Uint8Array(edges.length);
    const loops: Array<Array<{ column: number; row: number }>> = [];
    const turnRank = (
        incoming: SurfaceBoundaryEdge,
        candidate: SurfaceBoundaryEdge,
    ) => {
        const inX = incoming.endX - incoming.startX;
        const inY = incoming.endY - incoming.startY;
        const outX = candidate.endX - candidate.startX;
        const outY = candidate.endY - candidate.startY;
        const cross = inX * outY - inY * outX;
        const dot = inX * outX + inY * outY;
        return cross > 0 ? 0 : dot > 0 ? 1 : cross < 0 ? 2 : 3;
    };
    let work = 0;
    for (let first = 0; first < edges.length; first += 1) {
        if (used[first]) continue;
        const loop: Array<{ column: number; row: number }> = [];
        const origin = key(edges[first].startX, edges[first].startY);
        let current = first;
        let guard = 0;
        while (!used[current] && guard <= edges.length) {
            throwIfSurfaceCamAborted(signal);
            const edge = edges[current];
            used[current] = 1;
            loop.push({ column: edge.startX, row: edge.startY });
            const endKey = key(edge.endX, edge.endY);
            if (endKey === origin) {
                loop.push({ column: edge.endX, row: edge.endY });
                break;
            }
            const next = (outgoing.get(endKey) ?? [])
                .filter((index) => !used[index])
                .sort(
                    (a, b) =>
                        turnRank(edge, edges[a]) - turnRank(edge, edges[b]),
                )[0];
            if (next === undefined) break;
            current = next;
            guard += 1;
            work += 1;
            if (work % 16_384 === 0) await yieldSurfacePathWork();
        }
        if (
            loop.length >= 5 &&
            loop[0].column === loop[loop.length - 1].column &&
            loop[0].row === loop[loop.length - 1].row
        )
            loops.push(loop);
    }
    throwIfSurfaceCamAborted(signal);
    return loops;
}

/** Trace closed, cutter-compensated contours around exposed raster boundaries. */
export function buildSurfaceBoundaryPaths(
    field: HeightField,
    options: SurfacePathOptions,
): SurfacePathPoint[][] {
    return buildSurfaceBoundaryPathsFromLoops(
        field,
        options,
        surfaceBoundaryLoops(surfaceBoundaryEdges(field)),
    );
}

export async function buildSurfaceBoundaryPathsAsync(
    field: HeightField,
    options: SurfacePathOptions,
    signal?: AbortSignal,
): Promise<SurfacePathPoint[][]> {
    throwIfSurfaceCamAborted(signal);
    const loops = await surfaceBoundaryLoopsAsync(
        await surfaceBoundaryEdgesAsync(field, signal),
        signal,
    );
    const paths: SurfacePathPoint[][] = [];
    let visited = 0;
    for (const loop of loops) {
        const path: SurfacePathPoint[] = [];
        for (const point of loop) {
            throwIfSurfaceCamAborted(signal);
            const x = Math.max(
                field.bounds.minX,
                Math.min(
                    field.bounds.maxX,
                    field.bounds.minX + (point.column - 0.5) * field.cellSize,
                ),
            );
            const y = Math.max(
                field.bounds.minY,
                Math.min(
                    field.bounds.maxY,
                    field.bounds.minY + (point.row - 0.5) * field.cellSize,
                ),
            );
            const prior = path[path.length - 1];
            if (!prior || Math.hypot(x - prior.x, y - prior.y) >= 1e-9) {
                path.push({
                    x,
                    y,
                    z: cutterContactHeight(
                        field,
                        x,
                        y,
                        options.cutter,
                        options.toolDiameterMm,
                        options.stockToLeaveMm ?? 0,
                    ),
                });
            }
            visited += 1;
            if (visited % 256 === 0) await yieldSurfacePathWork();
        }
        if (path.length >= 4) {
            const first = path[0];
            const last = path[path.length - 1];
            if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9)
                path.push({ ...first });
            paths.push(path);
        }
    }
    throwIfSurfaceCamAborted(signal);
    return paths;
}

function buildSurfaceBoundaryPathsFromLoops(
    field: HeightField,
    options: SurfacePathOptions,
    loops: Array<Array<{ column: number; row: number }>>,
    signal?: AbortSignal,
): SurfacePathPoint[][] {
    const paths: SurfacePathPoint[][] = [];
    for (const loop of loops) {
        throwIfSurfaceCamAborted(signal);
        const path: SurfacePathPoint[] = [];
        for (const point of loop) {
            const x = Math.max(
                field.bounds.minX,
                Math.min(
                    field.bounds.maxX,
                    field.bounds.minX + (point.column - 0.5) * field.cellSize,
                ),
            );
            const y = Math.max(
                field.bounds.minY,
                Math.min(
                    field.bounds.maxY,
                    field.bounds.minY + (point.row - 0.5) * field.cellSize,
                ),
            );
            const prior = path[path.length - 1];
            if (prior && Math.hypot(x - prior.x, y - prior.y) < 1e-9) continue;
            path.push({
                x,
                y,
                z: cutterContactHeight(
                    field,
                    x,
                    y,
                    options.cutter,
                    options.toolDiameterMm,
                    options.stockToLeaveMm ?? 0,
                ),
            });
        }
        if (path.length >= 4) {
            const first = path[0];
            const last = path[path.length - 1];
            if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9)
                path.push({ ...first });
            paths.push(path);
        }
    }
    return paths;
}

/** Build boustrophedon raster finish paths from precomputed cutter-contact heights. */
export function buildRasterPaths(
    field: HeightField,
    contactHeights: Float32Array,
    options: SurfacePathOptions,
): SurfacePathPoint[][] {
    if (
        !(options.toolDiameterMm > 0) ||
        !(options.stepoverMm > 0) ||
        !(options.stepdownMm > 0)
    )
        throw new Error(
            'Tool diameter, stepover, and stepdown must be positive.',
        );
    const step = options.sampleStepMm ?? field.cellSize;
    if (!(step > 0)) throw new Error('Path sample step must be positive.');
    const paths: SurfacePathPoint[][] = [];
    const rowStep = Math.max(
        1,
        Math.floor(options.stepoverMm / field.cellSize + 1e-9),
    );
    const rows = rasterPathRows(field.rows, rowStep);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        let line: SurfacePathPoint[] = [];
        const reverse = rowIndex % 2 === 1;
        for (let n = 0; n < field.columns; n += 1) {
            const column = reverse ? field.columns - 1 - n : n;
            const index = row * field.columns + column;
            if (!field.covered[index] || !finite(contactHeights[index])) {
                if (line.length > 1) paths.push(line);
                line = [];
                continue;
            }
            const x = field.bounds.minX + column * field.cellSize;
            const y = field.bounds.minY + row * field.cellSize;
            const z = contactHeights[index];
            if (
                line.length &&
                Math.hypot(
                    x - line[line.length - 1].x,
                    y - line[line.length - 1].y,
                ) >
                    step * 1.5
            ) {
                if (line.length > 1) paths.push(line);
                line = [];
            }
            line.push({ x, y, z });
        }
        if (line.length > 1) paths.push(line);
    }
    paths.push(...buildSurfaceBoundaryPaths(field, options));
    if (!paths.length)
        throw new Error(
            'No safe toolpath points could be generated for this surface.',
        );
    return paths;
}

/** Build successive flat-endmill roughing passes that leave the requested allowance. */
export function buildClearingPaths(
    field: HeightField,
    contactHeights: Float32Array,
    options: SurfacePathOptions,
): SurfacePathPoint[][] {
    if (options.cutter !== 'flat')
        throw new Error('Surface clearing requires a flat endmill.');
    if (!(options.stepdownMm > 0) || !(options.stepoverMm > 0))
        throw new Error('Stepdown and stepover must be positive.');
    const minimum = contactHeights.reduce(
        (value, current, index) =>
            field.covered[index] && finite(current)
                ? Math.min(value, current)
                : value,
        Infinity,
    );
    if (!finite(minimum))
        throw new Error('No surface height data is available for clearing.');
    const paths: SurfacePathPoint[][] = [];
    const rowStep = Math.max(
        1,
        Math.floor(options.stepoverMm / field.cellSize + 1e-9),
    );
    const rows = rasterPathRows(field.rows, rowStep);
    const sampleStep = options.sampleStepMm ?? field.cellSize;
    let passZ = options.stockTopZMm;
    while (passZ > minimum + 1e-6) {
        passZ = Math.max(passZ - options.stepdownMm, minimum);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const line: SurfacePathPoint[] = [];
            const reverse = rowIndex % 2 === 1;
            for (let n = 0; n < field.columns; n += 1) {
                const column = reverse ? field.columns - 1 - n : n;
                const index = row * field.columns + column;
                if (!field.covered[index] || !finite(contactHeights[index])) {
                    if (line.length > 1) paths.push(line.splice(0));
                    else line.length = 0;
                    continue;
                }
                const x = field.bounds.minX + column * field.cellSize;
                const y = field.bounds.minY + row * field.cellSize;
                const z = Math.max(passZ, contactHeights[index]);
                const prior = line[line.length - 1];
                if (
                    prior &&
                    Math.hypot(x - prior.x, y - prior.y) > sampleStep * 1.5
                ) {
                    if (line.length > 1) paths.push(line.splice(0));
                }
                line.push({ x, y, z });
            }
            if (line.length > 1) paths.push(line);
        }
    }
    if (!paths.length)
        throw new Error(
            'No clearing paths could be generated for the current stock and model bounds.',
        );
    return paths;
}

const yieldSurfacePathWork = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

interface WaterlineNode {
    x: number;
    y: number;
}

interface WaterlineSegment {
    start: number;
    end: number;
}

async function traceWaterlineSegments(
    segments: WaterlineSegment[],
    signal?: AbortSignal,
): Promise<number[][]> {
    const adjacent = new Map<number, number[]>();
    for (let index = 0; index < segments.length; index += 1) {
        throwIfSurfaceCamAborted(signal);
        const segment = segments[index];
        for (const node of [segment.start, segment.end]) {
            const entries = adjacent.get(node) ?? [];
            entries.push(index);
            adjacent.set(node, entries);
        }
        if (index > 0 && index % 16_384 === 0) await yieldSurfacePathWork();
    }
    const used = new Uint8Array(segments.length);
    const paths: number[][] = [];
    let visitedSegments = 0;
    const walk = async (start: number, firstSegment: number) => {
        const path = [start];
        let node = start;
        let segmentIndex = firstSegment;
        let guard = 0;
        while (!used[segmentIndex] && guard <= segments.length) {
            throwIfSurfaceCamAborted(signal);
            used[segmentIndex] = 1;
            const segment = segments[segmentIndex];
            node = segment.start === node ? segment.end : segment.start;
            path.push(node);
            visitedSegments += 1;
            if (visitedSegments % 16_384 === 0) await yieldSurfacePathWork();
            const next = (adjacent.get(node) ?? []).find(
                (index) => !used[index],
            );
            if (next === undefined || node === start) break;
            segmentIndex = next;
            guard += 1;
        }
        if (path.length > 1) paths.push(path);
    };
    for (const [node, incident] of adjacent) {
        if (incident.length === 2) continue;
        for (const segment of incident)
            if (!used[segment]) await walk(node, segment);
    }
    for (let segment = 0; segment < segments.length; segment += 1)
        if (!used[segment]) await walk(segments[segment].start, segment);
    return paths;
}

/** Generate constant-height contour bands from the compensated draped surface. */
export async function buildWaterlinePathsAsync(
    field: HeightField,
    contactHeights: Float32Array,
    options: SurfacePathOptions,
    signal?: AbortSignal,
    onProgress?: (progress: { percent: number; label: string }) => void,
): Promise<SurfacePathPoint[][]> {
    if (options.cutter !== 'ball' && options.cutter !== 'ballnose')
        throw new Error(
            'Waterline finishing requires a tool-library ball endmill.',
        );
    if (!(options.stepdownMm > 0) || !finite(options.stepdownMm))
        throw new Error(
            'Waterline Z level spacing must be a positive finite value.',
        );
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < contactHeights.length; index += 1) {
        throwIfSurfaceCamAborted(signal);
        if (index > 0 && index % 262_144 === 0) await yieldSurfacePathWork();
        if (!field.covered[index] || !finite(contactHeights[index])) continue;
        minimum = Math.min(minimum, contactHeights[index]);
        maximum = Math.max(maximum, contactHeights[index]);
    }
    if (!finite(minimum) || !finite(maximum))
        throw new Error(
            'No compensated surface data is available for waterline finishing.',
        );
    const levelCount = Math.ceil((maximum - minimum) / options.stepdownMm);
    if (!levelCount)
        return buildSurfaceBoundaryPathsAsync(field, options, signal);
    if (
        levelCount > 10_000 ||
        field.columns * field.rows * levelCount > 250_000_000
    )
        throw new Error(
            'Waterline finishing exceeds the bounded contour workload. Increase Z level spacing or machining grid size.',
        );

    const output: SurfacePathPoint[][] = [];
    let generatedSamples = 0;
    const maxGeneratedSamples = 500_000;
    const levelTotal = levelCount;
    for (let levelIndex = 1; levelIndex <= levelCount; levelIndex += 1) {
        throwIfSurfaceCamAborted(signal);
        const level = maximum - ((maximum - minimum) * levelIndex) / levelCount;
        const nodes: WaterlineNode[] = [];
        const nodeByKey = new Map<string, number>();
        const segments: WaterlineSegment[] = [];
        const intern = (x: number, y: number) => {
            const key = `${Math.round((x / field.cellSize) * 1e6)},${Math.round((y / field.cellSize) * 1e6)}`;
            const prior = nodeByKey.get(key);
            if (prior !== undefined) return prior;
            const index = nodes.length;
            nodes.push({ x, y });
            nodeByKey.set(key, index);
            return index;
        };
        const crossing = (
            a: number,
            b: number,
            ax: number,
            ay: number,
            bx: number,
            by: number,
        ) => {
            const za = contactHeights[a];
            const zb = contactHeights[b];
            if (za < level === zb < level || Math.abs(zb - za) < 1e-12)
                return null;
            const t = Math.max(0, Math.min(1, (level - za) / (zb - za)));
            return intern(ax + (bx - ax) * t, ay + (by - ay) * t);
        };
        for (let row = 0; row < field.rows - 1; row += 1) {
            throwIfSurfaceCamAborted(signal);
            for (let column = 0; column < field.columns - 1; column += 1) {
                if (column > 0 && column % 16_384 === 0) {
                    await yieldSurfacePathWork();
                    throwIfSurfaceCamAborted(signal);
                }
                const bl = row * field.columns + column;
                const br = bl + 1;
                const tr = br + field.columns;
                const tl = bl + field.columns;
                if (
                    !field.covered[bl] ||
                    !field.covered[br] ||
                    !field.covered[tr] ||
                    !field.covered[tl] ||
                    !finite(contactHeights[bl]) ||
                    !finite(contactHeights[br]) ||
                    !finite(contactHeights[tr]) ||
                    !finite(contactHeights[tl])
                )
                    continue;
                const x = field.bounds.minX + column * field.cellSize;
                const y = field.bounds.minY + row * field.cellSize;
                const crossings = [
                    crossing(bl, br, x, y, x + field.cellSize, y),
                    crossing(
                        br,
                        tr,
                        x + field.cellSize,
                        y,
                        x + field.cellSize,
                        y + field.cellSize,
                    ),
                    crossing(
                        tr,
                        tl,
                        x + field.cellSize,
                        y + field.cellSize,
                        x,
                        y + field.cellSize,
                    ),
                    crossing(tl, bl, x, y + field.cellSize, x, y),
                ];
                const edgeIds = crossings.flatMap((node, edge) =>
                    node === null ? [] : [{ edge, node }],
                );
                const addSegment = (a: number, b: number) => {
                    if (a === b) return;
                    segments.push({ start: a, end: b });
                    if (segments.length > maxGeneratedSamples)
                        throw new Error(
                            'Waterline contour output is too large. Increase machining grid size or Z level spacing.',
                        );
                };
                if (edgeIds.length === 2)
                    addSegment(edgeIds[0].node, edgeIds[1].node);
                else if (edgeIds.length === 4) {
                    const centerHigh =
                        (contactHeights[bl] +
                            contactHeights[br] +
                            contactHeights[tr] +
                            contactHeights[tl]) /
                            4 >=
                        level;
                    const bottomLeftHigh = contactHeights[bl] >= level;
                    if (centerHigh === bottomLeftHigh) {
                        addSegment(crossings[0]!, crossings[1]!);
                        addSegment(crossings[2]!, crossings[3]!);
                    } else {
                        addSegment(crossings[3]!, crossings[0]!);
                        addSegment(crossings[1]!, crossings[2]!);
                    }
                }
            }
            if ((row + 1) % 32 === 0) {
                onProgress?.({
                    percent: Math.round(
                        ((levelIndex - 1 + (row + 1) / field.rows) /
                            levelTotal) *
                            100,
                    ),
                    label: 'Generating waterline contours',
                });
                await yieldSurfacePathWork();
            }
        }
        const chains = await traceWaterlineSegments(segments, signal);
        for (const chain of chains) {
            throwIfSurfaceCamAborted(signal);
            const path: SurfacePathPoint[] = [];
            for (let index = 1; index < chain.length; index += 1) {
                const start = nodes[chain[index - 1]];
                const end = nodes[chain[index]];
                const distance = Math.hypot(end.x - start.x, end.y - start.y);
                const samples = Math.max(
                    1,
                    Math.ceil(distance / (field.cellSize * 0.5)),
                );
                if (!path.length)
                    path.push({
                        x: start.x,
                        y: start.y,
                        z: cutterContactHeight(
                            field,
                            start.x,
                            start.y,
                            options.cutter,
                            options.toolDiameterMm,
                        ),
                    });
                for (let sample = 1; sample <= samples; sample += 1) {
                    const t = sample / samples;
                    const x = start.x + (end.x - start.x) * t;
                    const y = start.y + (end.y - start.y) * t;
                    path.push({
                        x,
                        y,
                        z: cutterContactHeight(
                            field,
                            x,
                            y,
                            options.cutter,
                            options.toolDiameterMm,
                        ),
                    });
                    generatedSamples += 1;
                    if (generatedSamples > maxGeneratedSamples)
                        throw new Error(
                            'Waterline contour output is too large. Increase machining grid size or Z level spacing.',
                        );
                    if (generatedSamples % 256 === 0) {
                        await yieldSurfacePathWork();
                        throwIfSurfaceCamAborted(signal);
                    }
                }
            }
            if (path.length > 1) output.push(path);
        }
    }
    output.push(
        ...(await buildSurfaceBoundaryPathsAsync(field, options, signal)),
    );
    if (!output.length)
        throw new Error(
            'No waterline contours could be generated for this surface.',
        );
    onProgress?.({ percent: 100, label: 'Waterline finishing paths complete' });
    return output;
}

/** Responsive, cancellable version used by the interactive 3D CAM workflow. */
export async function buildRasterPathsAsync(
    field: HeightField,
    contactHeights: Float32Array,
    options: SurfacePathOptions,
    signal?: AbortSignal,
    onProgress?: (progress: { percent: number; label: string }) => void,
    sampledRows?: readonly number[],
): Promise<SurfacePathPoint[][]> {
    if (
        !(options.toolDiameterMm > 0) ||
        !(options.stepoverMm > 0) ||
        !(options.stepdownMm > 0)
    )
        throw new Error(
            'Tool diameter, stepover, and stepdown must be positive.',
        );
    const step = options.sampleStepMm ?? field.cellSize;
    if (!(step > 0)) throw new Error('Path sample step must be positive.');
    const paths: SurfacePathPoint[][] = [];
    const rowStep = Math.max(
        1,
        Math.floor(options.stepoverMm / field.cellSize + 1e-9),
    );
    const rows = rasterPathRows(field.rows, rowStep);
    let rowIndex = 0;
    let visitedRows = 0;
    const totalRows = rows.length;
    for (const row of rows) {
        throwIfSurfaceCamAborted(signal);
        let line: SurfacePathPoint[] = [];
        const reverse = rowIndex % 2 === 1;
        for (let n = 0; n < field.columns; n += 1) {
            if (n > 0 && n % 8192 === 0) {
                onProgress?.({
                    percent: Math.round((visitedRows / totalRows) * 100),
                    label: 'Generating cancellable finish paths',
                });
                await yieldSurfacePathWork();
                throwIfSurfaceCamAborted(signal);
            }
            const column = reverse ? field.columns - 1 - n : n;
            const index = row * field.columns + column;
            const contactIndex = sampledRows
                ? rowIndex * field.columns + column
                : index;
            if (
                !field.covered[index] ||
                !finite(contactHeights[contactIndex])
            ) {
                if (line.length > 1) paths.push(line);
                line = [];
                continue;
            }
            const x = field.bounds.minX + column * field.cellSize;
            const y = field.bounds.minY + row * field.cellSize;
            const z = contactHeights[contactIndex];
            if (
                line.length &&
                Math.hypot(
                    x - line[line.length - 1].x,
                    y - line[line.length - 1].y,
                ) >
                    step * 1.5
            ) {
                if (line.length > 1) paths.push(line);
                line = [];
            }
            line.push({ x, y, z });
        }
        if (line.length > 1) paths.push(line);
        rowIndex += 1;
        visitedRows += 1;
        if (rowIndex % 8 === 0 || row === field.rows - 1) {
            onProgress?.({
                percent: Math.round((visitedRows / totalRows) * 100),
                label: 'Generating cancellable finish paths',
            });
            await yieldSurfacePathWork();
        }
    }
    throwIfSurfaceCamAborted(signal);
    paths.push(
        ...(await buildSurfaceBoundaryPathsAsync(field, options, signal)),
    );
    if (!paths.length)
        throw new Error(
            'No safe toolpath points could be generated for this surface.',
        );
    return paths;
}

/** Responsive, cancellable version used by the interactive 3D CAM workflow. */
export async function buildClearingPathsAsync(
    field: HeightField,
    contactHeights: Float32Array,
    options: SurfacePathOptions,
    signal?: AbortSignal,
    onProgress?: (progress: { percent: number; label: string }) => void,
    sampledRows?: readonly number[],
): Promise<SurfacePathPoint[][]> {
    if (options.cutter !== 'flat')
        throw new Error('Surface clearing requires a flat endmill.');
    if (!(options.stepdownMm > 0) || !(options.stepoverMm > 0))
        throw new Error('Stepdown and stepover must be positive.');
    let minimum = Infinity;
    if (sampledRows) {
        for (let rowIndex = 0; rowIndex < sampledRows.length; rowIndex += 1) {
            const row = sampledRows[rowIndex];
            for (let column = 0; column < field.columns; column += 1) {
                const gridIndex = row * field.columns + column;
                const contactIndex = rowIndex * field.columns + column;
                if (
                    field.covered[gridIndex] &&
                    finite(contactHeights[contactIndex])
                )
                    minimum = Math.min(minimum, contactHeights[contactIndex]);
            }
        }
    } else {
        minimum = contactHeights.reduce(
            (value, current, index) =>
                field.covered[index] && finite(current)
                    ? Math.min(value, current)
                    : value,
            Infinity,
        );
    }
    if (!finite(minimum))
        throw new Error('No surface height data is available for clearing.');
    const paths: SurfacePathPoint[][] = [];
    const rowStep = Math.max(
        1,
        Math.floor(options.stepoverMm / field.cellSize + 1e-9),
    );
    const rows = rasterPathRows(field.rows, rowStep);
    const sampleStep = options.sampleStepMm ?? field.cellSize;
    const passCount = Math.max(
        1,
        Math.ceil(
            Math.max(0, options.stockTopZMm - minimum) / options.stepdownMm,
        ),
    );
    let passZ = options.stockTopZMm;
    let passIndex = 0;
    while (passZ > minimum + 1e-6) {
        throwIfSurfaceCamAborted(signal);
        passZ = Math.max(passZ - options.stepdownMm, minimum);
        let visitedRows = 0;
        const totalRows = rows.length;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            throwIfSurfaceCamAborted(signal);
            const row = rows[rowIndex];
            const line: SurfacePathPoint[] = [];
            const reverse = rowIndex % 2 === 1;
            for (let n = 0; n < field.columns; n += 1) {
                if (n > 0 && n % 8192 === 0) {
                    onProgress?.({
                        percent: Math.round(
                            ((passIndex + visitedRows / totalRows) /
                                passCount) *
                                100,
                        ),
                        label: 'Generating cancellable clearing paths',
                    });
                    await yieldSurfacePathWork();
                    throwIfSurfaceCamAborted(signal);
                }
                const column = reverse ? field.columns - 1 - n : n;
                const index = row * field.columns + column;
                const contactIndex = sampledRows
                    ? rowIndex * field.columns + column
                    : index;
                if (
                    !field.covered[index] ||
                    !finite(contactHeights[contactIndex])
                ) {
                    if (line.length > 1) paths.push(line.splice(0));
                    else line.length = 0;
                    continue;
                }
                const x = field.bounds.minX + column * field.cellSize;
                const y = field.bounds.minY + row * field.cellSize;
                const z = Math.max(passZ, contactHeights[contactIndex]);
                const prior = line[line.length - 1];
                if (
                    prior &&
                    Math.hypot(x - prior.x, y - prior.y) > sampleStep * 1.5
                ) {
                    if (line.length > 1) paths.push(line.splice(0));
                }
                line.push({ x, y, z });
            }
            if (line.length > 1) paths.push(line);
            visitedRows += 1;
            if (visitedRows % 8 === 0 || row === field.rows - 1) {
                onProgress?.({
                    percent: Math.round(
                        ((passIndex + visitedRows / totalRows) / passCount) *
                            100,
                    ),
                    label: 'Generating cancellable clearing paths',
                });
                await yieldSurfacePathWork();
            }
        }
        passIndex += 1;
    }
    throwIfSurfaceCamAborted(signal);
    if (!paths.length)
        throw new Error(
            'No clearing paths could be generated for the current stock and model bounds.',
        );
    return paths;
}
