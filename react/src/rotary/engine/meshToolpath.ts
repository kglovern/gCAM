import { fixtureXClearance, defaultFixtureSettings } from './fixtureClearance';
import { meshResidual } from './meshResidual';
import { planRotarySurface } from './rotaryPaths';
import { createMeshAccess } from './meshAccess';
import {
    rasterizeTopSurface,
    rasterPathRows,
    buildClearingPaths,
    cutterContactHeight,
    type SurfaceMesh,
} from '../../engine/surface-cam';
import { rotarySurfaceMesh, validateRotaryMesh } from './meshCoordinates';
import type {
    RotaryMeshSettings,
    RotaryStock,
    RotaryTool,
    StlMesh,
    ToolpathMove,
} from './types';

export const defaultMeshSettings: RotaryMeshSettings = {
    strategy: 'around',
    ...defaultFixtureSettings,
    tolerance: 0.25,
    stepover: 0.5,
    angleStep: 45,
    fluteLength: 0,
    stickout: 0,
    tailClearance: 6,
    rotaryRate: 720,
    independentAxis: false,
};

export function meshSettingsForTool(
    settings: RotaryMeshSettings,
    diameter: number,
    rough: boolean,
): RotaryMeshSettings {
    const stepover = diameter * (rough ? 0.4 : 0.15);
    return {
        ...settings,
        strategy:
            rough && settings.strategy === 'helix'
                ? 'around'
                : settings.strategy,
        stepover,
        cellSize: Math.min(
            rough ? 0.5 : settings.tolerance / 2,
            diameter / 4,
            stepover,
        ),
    };
}

/** Convex swept triangle prisms contain linear rotation chords. The caller
 * expands their cutter envelope by the maximum arc/chord sagitta. */
export function sweptSurface(
    mesh: StlMesh,
    start: number,
    end: number,
): SurfaceMesh {
    const a = rotarySurfaceMesh(mesh, start),
        b = rotarySurfaceMesh(mesh, end);
    if (start === end) return a;
    // All triples include every convex-hull face of the six endpoint vertices;
    // choosing just one diagonal per twisted side can miss swept material.
    const faces: number[][] = [];
    for (let i = 0; i < 6; i++)
        for (let j = i + 1; j < 6; j++)
            for (let k = j + 1; k < 6; k++) faces.push([i, j, k]);
    const vertices = new Float32Array(a.vertices.length * faces.length);
    let out = 0;
    for (let i = 0; i < a.vertices.length; i += 9) {
        for (const face of faces)
            for (const index of face) {
                const src = index < 3 ? a.vertices : b.vertices;
                const j = i + (index % 3) * 3;
                vertices.set(src.subarray(j, j + 3), out);
                out += 3;
            }
    }
    return {
        vertices,
        sourceName: mesh.name,
        bounds: {
            minX: a.bounds.minX,
            maxX: a.bounds.maxX,
            minY: Math.min(a.bounds.minY, b.bounds.minY),
            maxY: Math.max(a.bounds.maxY, b.bounds.maxY),
            minZ: Math.min(a.bounds.minZ, b.bounds.minZ),
            maxZ: Math.max(a.bounds.maxZ, b.bounds.maxZ),
        },
    };
}

/** Conservative time bound: translation + rotary swept arc, plus A rate limit. */
export function blockMinutes(
    from: Required<Pick<ToolpathMove, 'x' | 'y' | 'z' | 'a'>>,
    to: Required<Pick<ToolpathMove, 'x' | 'y' | 'z' | 'a'>>,
    feed: number,
    rotaryRate: number,
    stockRadius = 0,
) {
    const posted = (n: number) => Math.round(n * 1000) / 1000;
    const da = Math.abs(posted(to.a) - posted(from.a));
    const radius = Math.max(
        stockRadius,
        Math.hypot(posted(from.y), posted(from.z)),
        Math.hypot(posted(to.y), posted(to.z)),
    );
    const length =
        Math.hypot(
            posted(to.x) - posted(from.x),
            posted(to.y) - posted(from.y),
            posted(to.z) - posted(from.z),
        ) +
        (radius * da * Math.PI) / 180;
    return Math.max(length / feed, da / rotaryRate, 1e-6);
}

export function planMeshToolpath(
    mesh: StlMesh,
    stock: RotaryStock,
    tool: RotaryTool,
    operation: 'rough' | 'finish',
    stepdown: number,
    allowance: number,
    settings: RotaryMeshSettings,
    aborted: () => boolean = () => false,
    onWarning: (message: string) => void = () => {},
    onProgress: (fraction: number) => void = () => {},
): ToolpathMove[] {
    validateRotaryMesh(mesh);
    const s = settings,
        radius = stock.diameter / 2,
        cutterRadius = tool.dia / 2;
    const indexed = s.strategy === 'indexed' || s.strategy === 'simultaneous';
    if (
        typeof stock.ext !== 'boolean' ||
        !Number.isFinite(stock.grip) ||
        stock.grip < 19 ||
        stock.diameter > 101.6 ||
        stock.length > (stock.ext ? 1003 : 546)
    )
        throw new Error(
            'Stock must fit the configured Vortex track/capacity and have at least 19 mm grip.',
        );
    const positive = [
        s.tolerance,
        ...(indexed ? [s.cellSize, s.angleStep] : []),
        s.stepover,
        s.clearance,
        s.rotaryRate,
        tool.dia,
        tool.spindle,
        tool.feed,
        tool.plunge,
        stepdown,
        stock.length,
        stock.diameter,
    ];
    if (
        positive.some((n) => !Number.isFinite(n) || n <= 0) ||
        !Number.isFinite(allowance) ||
        allowance < 0 ||
        !Number.isFinite(s.tailClearance) ||
        s.tailClearance < 0
    )
        throw new Error(
            'Mesh cell, tolerance, stepover, A spacing/rate, cutter diameter, feeds, spindle speed, safe clearance, stepdown and stock dimensions must be greater than zero. Allowance and tailstock clearance cannot be negative.',
        );
    if (
        [s.shankDiameter, s.holderDiameter].some(
            (n) => !Number.isFinite(n) || n < 0,
        )
    )
        throw new Error(
            'Optional shank and holder diameters must be zero or positive.',
        );
    if (tool.type === 'taper')
        throw new Error(
            'This tapered ball endmill is not supported for STL machining. Choose a straight ball endmill for finishing or a flat endmill for roughing.',
        );
    if (!['flat', 'ball'].includes(tool.type))
        throw new Error('Choose a flat or straight ball endmill for this STL.');
    if (operation === 'rough' && tool.type !== 'flat' && indexed)
        throw new Error(
            'Roughing needs a flat endmill. Use your ball endmill for finishing after the blank has been roughed.',
        );
    if (
        !['around', 'along', 'helix', 'indexed', 'simultaneous'].includes(
            s.strategy,
        )
    )
        throw new Error('Choose a rotary cutting pattern.');
    if (indexed && s.cellSize < 0.02)
        throw new Error(
            `Mesh cell size is ${s.cellSize} mm; use at least 0.02 mm.`,
        );
    if (s.stepover > tool.dia / 2)
        throw new Error(
            `Stepover is ${s.stepover} mm; use at most ${tool.dia / 2} mm for the Ø${tool.dia} mm cutter.`,
        );
    const maxCell = Math.min(s.stepover, tool.dia / 4);
    if (indexed && s.cellSize > maxCell)
        throw new Error(
            `Mesh cell size is ${s.cellSize} mm; use at most ${maxCell} mm for this cutter and stepover.`,
        );
    if (indexed && (s.angleStep > 90 || s.angleStep < 1))
        throw new Error(`A spacing is ${s.angleStep}°; use 1–90°.`);
    if (s.strategy === 'simultaneous' && operation === 'rough')
        throw new Error(
            'Rough with indexed setups before simultaneous finishing.',
        );
    if (mesh.triangles > 100_000)
        throw new Error(
            'Rotary mesh planner currently supports at most 100,000 triangles. Simplify the mesh.',
        );
    const zero = rotarySurfaceMesh(mesh, 0);
    const fixtureMargin = fixtureXClearance(tool, s);
    const xmin = Math.max(zero.bounds.minX, stock.grip + fixtureMargin);
    const xmax = Math.min(
        zero.bounds.maxX,
        stock.length - s.tailClearance - fixtureMargin,
    );
    if (xmin > zero.bounds.minX + 1e-6 || xmax < zero.bounds.maxX - 1e-6)
        throw new Error(
            'Model/cutter overlaps chuck grip or tailstock clearance. Increase exposed stock length or reposition the model.',
        );
    let radial = 0;
    for (let i = 0; i < mesh.positions.length; i += 3)
        radial = Math.max(
            radial,
            Math.hypot(mesh.positions[i + 1], mesh.positions[i + 2]),
        );
    if (radial > radius)
        throw new Error(
            'The STL extends outside the cylindrical stock. Increase stock diameter.',
        );
    if (
        s.strategy === 'around' ||
        s.strategy === 'along' ||
        s.strategy === 'helix'
    )
        return planRotarySurface(
            mesh,
            stock,
            tool,
            operation,
            stepdown,
            allowance,
            s,
            xmin,
            xmax,
            aborted,
            onProgress,
        );
    const access = createMeshAccess(mesh);
    const count = Math.ceil(360 / s.angleStep),
        angleStep = 360 / count;
    const columns = Math.ceil((xmax - xmin) / s.cellSize) + 1,
        rows = Math.ceil((2 * radius) / s.cellSize) + 1;
    if (columns * rows * count > 4_000_000)
        throw new Error(
            'Mesh job exceeds the 4-million-sample limit. Increase cell size or angular spacing.',
        );
    const safe = radius + s.clearance,
        moves: ToolpathMove[] = [];
    let previous = { x: xmin, y: 0, z: safe, a: 0 };
    const push = (point: typeof previous, rapid: boolean, feed = tool.feed) => {
        if (moves.length > 500_000)
            throw new Error(
                'Rotary job exceeds the 500,000-move limit. Increase cell size or stepover.',
            );
        moves.push({
            ...point,
            rapid,
            op: operation,
            ...(!rapid
                ? {
                      f: feed,
                      minutes: blockMinutes(
                          previous,
                          point,
                          feed,
                          s.rotaryRate,
                          radius,
                      ),
                  }
                : {}),
        });
        previous = point;
    };
    const slices = new Map<number, StlMesh>();
    for (let index = 0; index < count; index++) {
        onProgress((0.9 * index) / count);
        if (aborted()) throw new Error('Rotary planning cancelled.');
        const start = index * angleStep,
            end = s.strategy === 'simultaneous' ? start + angleStep : start;
        const meshPose = rotarySurfaceMesh(mesh, start);
        // Every rotating vertex is within this distance of its chord.
        const sagitta =
            radial * (1 - Math.cos(((end - start) * Math.PI) / 360));
        const guard =
            (s.strategy === 'indexed' ? sagitta : 0) + s.cellSize * Math.SQRT2;
        const field = rasterizeTopSurface(
            {
                ...meshPose,
                bounds: {
                    ...meshPose.bounds,
                    minX: xmin,
                    maxX: xmax,
                    minY: -radius,
                    maxY: radius,
                },
            },
            s.cellSize,
        );
        const visibilityField =
            start === end
                ? field
                : rasterizeTopSurface(
                      rotarySurfaceMesh(mesh, start),
                      s.cellSize,
                  );
        access.observe(start, visibilityField, 0);
        const rowStep = Math.max(1, Math.floor(s.stepover / s.cellSize));
        const sampledRows = rasterPathRows(field.rows, rowStep);
        const estimatedLevels =
            operation === 'rough' ? Math.ceil(radius / stepdown) : 1;
        if (
            estimatedLevels * sampledRows.length * (field.columns + 3) * count >
            500_000
        )
            throw new Error(
                'Rotary job exceeds the 500,000-move limit. Increase stepdown, cell size or stepover.',
            );
        const contact = new Float32Array(field.heights.length);
        // Uncovered projected stock is intentionally cleared only to the axis.
        for (let i = 0; i < field.heights.length; i++) {
            if (!field.covered[i]) field.heights[i] = 0;
            field.covered[i] = 1;
        }
        for (let col = 0; col < field.columns; col++) {
            const x = xmin + col * s.cellSize;
            let localField = field,
                localGuard = guard,
                verticalGuard = 0.001;
            if (s.strategy === 'simultaneous') {
                // Use only this segment's angular sweep, not the entire ribbon's
                // envelope (which would round facets back into a turning shape).
                const dt = 1 / Math.max(1, field.columns - 1),
                    t = col * dt;
                const low = start + angleStep * Math.max(0, t - dt),
                    high = start + angleStep * Math.min(1, t + dt);
                localGuard =
                    radial * (1 - Math.cos(((high - low) * Math.PI) / 360)) +
                    s.cellSize * Math.SQRT2;
                verticalGuard =
                    radial * (1 - Math.cos(((high - low) * Math.PI) / 360)) +
                    0.001;
                const reach = cutterRadius + localGuard + 2 * s.cellSize;
                let slice = slices.get(col);
                if (!slice) {
                    const positions: number[] = [];
                    for (let i = 0; i < mesh.positions.length; i += 9) {
                        const ax = mesh.positions[i],
                            bx = mesh.positions[i + 3],
                            cx = mesh.positions[i + 6];
                        if (
                            Math.min(ax, bx, cx) <= x + reach &&
                            Math.max(ax, bx, cx) >= x - reach
                        )
                            for (let k = 0; k < 9; k++)
                                positions.push(mesh.positions[i + k]);
                    }
                    slice = {
                        ...mesh,
                        positions: new Float32Array(positions),
                        triangles: positions.length / 9,
                    };
                    slices.set(col, slice);
                }
                const swept = sweptSurface(slice, low, high);
                localField = rasterizeTopSurface(
                    {
                        ...swept,
                        bounds: {
                            minX: x - reach,
                            maxX: x + reach,
                            minY: -radius,
                            maxY: radius,
                            minZ: -radius,
                            maxZ: radius,
                        },
                    },
                    s.cellSize,
                );
                for (let i = 0; i < localField.heights.length; i++) {
                    if (!localField.covered[i]) localField.heights[i] = 0;
                    localField.covered[i] = 1;
                }
            }
            for (const row of sampledRows) {
                const y = -radius + row * s.cellSize;
                contact[row * field.columns + col] = Math.max(
                    0,
                    cutterContactHeight(
                        localField,
                        x,
                        y,
                        tool.type === 'ball' ? 'ball' : 'flat',
                        tool.dia,
                        operation === 'rough' ? allowance : 0,
                        localGuard,
                        verticalGuard,
                    ),
                );
            }
        }
        if (operation === 'rough') {
            const paths = buildClearingPaths(field, contact, {
                toolDiameterMm: tool.dia,
                stepoverMm: s.stepover,
                stepdownMm: stepdown,
                stockTopZMm: radius,
                safeZMm: safe,
                cutter: 'flat',
            });
            for (const path of paths) {
                if (aborted()) throw new Error('Rotary planning cancelled.');
                const points = path.map((p) => ({
                    ...p,
                    z: Math.max(0, p.z),
                    a: start,
                }));
                push({ ...previous, z: safe }, true);
                push({ ...points[0], z: safe }, true);
                push(points[0], false, tool.plunge);
                for (const point of points.slice(1)) push(point, false);
                push({ ...previous, z: safe }, true);
            }
            continue;
        }
        for (const row of sampledRows) {
            if (aborted()) throw new Error('Rotary planning cancelled.');
            const reverse = Math.floor(row / rowStep) % 2 === 1;
            const points: (typeof previous)[] = [];
            for (let n = 0; n < field.columns; n++) {
                const col = reverse ? field.columns - 1 - n : n;
                const t = col / Math.max(1, field.columns - 1);
                // A diagonal ribbon varies X, Y and A together; the segment swept
                // envelope protects every point and segment in this strip.
                const y =
                    -radius +
                    row * s.cellSize +
                    (s.strategy === 'simultaneous' ? s.cellSize * t : 0);
                if (y > radius) continue;
                const z = Math.max(0, contact[row * field.columns + col]);
                points.push({
                    x: xmin + col * s.cellSize,
                    y,
                    z,
                    a: start + (end - start) * t,
                });
            }
            if (points.length < 2) continue;
            push({ ...previous, z: safe }, true);
            push({ ...points[0], z: safe }, true);
            push(points[0], false, tool.plunge);
            for (const point of points.slice(1)) push(point, false);
            push({ ...previous, z: safe }, true);
        }
    }
    push({ ...previous, z: safe }, true);
    onProgress(0.9);
    const unresolved = access.unresolved();
    if (operation === 'finish' && unresolved)
        onWarning(
            `${unresolved} STL faces are occluded or unresolved from these A setups. This finishing pass machines accessible surfaces; some areas may retain material.`,
        );
    if (operation === 'finish') {
        const residual = meshResidual(mesh, moves, tool, s.tolerance);
        if (residual.minClearance < -0.002)
            throw new Error(
                'Independent cutter-volume samples detected a possible model gouge. Output blocked.',
            );
        if (residual.unresolved)
            onWarning(
                `${residual.unresolved} surface probes exceed the ${s.tolerance} mm finish tolerance. Some areas retain material after this pass. A smaller cutter or another setup may be needed.`,
            );
    }
    onProgress(1);
    return moves;
}
