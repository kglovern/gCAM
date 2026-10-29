import { ballTipCutterSurfaceZ } from './preview-3d/cutter-envelope.js';
import { capPreviewSamples } from './preview-3d/sample-decimation.js';

/**
 * Purpose: Implementation module for cut-preview-3d-worker in the react domain.
 */
// Worker-side height-field construction. Keeping cutter sampling and raster
// painting here prevents complex jobs from blocking canvas interaction.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
let latestBuildVersion = 0;

function boundsFor(toolpaths, stock) {
    const points = [];
    for (const toolpath of toolpaths) {
        for (const contour of toolpath.previewContours || [])
            points.push(...contour);
        for (const path of toolpath.motionPaths || [])
            points.push(...(path.points || []));
    }
    if (!points.length) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) return null;
    const width = Number(stock?.widthMm);
    const height = Number(stock?.heightMm);
    if (
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
    ) {
        // The entered stock is authoritative. Geometry beyond it is flagged in
        // the editor rather than silently stretching the material to fit.
        return {
            minX: stock.origin === 'center' ? -width / 2 : 0,
            minY: stock.origin === 'center' ? -height / 2 : 0,
            maxX: stock.origin === 'center' ? width / 2 : width,
            maxY: stock.origin === 'center' ? height / 2 : height,
        };
    }
    // The stock is laid out from the machine origin as well as around the
    // programmed geometry. This keeps zero-coordinate work inside the stock
    // when all toolpath coordinates are positive (or all are negative).
    return {
        minX: Math.min(minX, 0),
        minY: Math.min(minY, 0),
        maxX: Math.max(maxX, 0),
        maxY: Math.max(maxY, 0),
    };
}

function tabDepth(toolpath, contour, along, cutDepth) {
    const contourIndex = toolpath.previewContours.indexOf(contour);
    const tabs = (toolpath.tabs || []).filter(
        (tab) => tab.contourIndex === contourIndex,
    );
    if (!tabs.length || !toolpath.tabHeight) return cutDepth;
    const total = contour.reduce(
        (sum, point, index) =>
            index ? sum + dist(contour[index - 1], point) : sum,
        0,
    );
    const cutter = toolpath.toolDiameter || 1;
    const ramp = Math.max(cutter * 0.75, 0.5);
    const width = Math.max(toolpath.tabWidth || 0, cutter * 1.5);
    const span = width + cutter;
    const top = -Math.max(0, (toolpath.cutDepth || 0) - toolpath.tabHeight);
    if (cutDepth >= top) return cutDepth;
    let result = cutDepth;
    for (const tab of tabs) {
        const start = Math.max(0, tab.along - span / 2);
        const end = Math.min(total, tab.along + span / 2);
        const rampStart = Math.max(0, start - ramp);
        const rampEnd = Math.min(total, end + ramp);
        let factor = 0;
        if (along >= start && along <= end) factor = 1;
        else if (along >= rampStart && along < start)
            factor = (along - rampStart) / Math.max(0.001, start - rampStart);
        else if (along > end && along <= rampEnd)
            factor = 1 - (along - end) / Math.max(0.001, rampEnd - end);
        result = Math.max(result, cutDepth + (top - cutDepth) * factor);
    }
    return result;
}

function addContourSamples(target, toolpath, contour, depth, step, metadata) {
    let travelled = 0;
    for (let index = 1; index < contour.length; index += 1) {
        const a = contour[index - 1],
            b = contour[index];
        const length = dist(a, b);
        const count = Math.max(1, Math.ceil(length / step));
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            target.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: tabDepth(
                    toolpath,
                    contour,
                    travelled + length * ratio,
                    depth,
                ),
                ...metadata,
            });
        }
        travelled += length;
    }
}

function addMotionSamples(
    target,
    points,
    step,
    metadata,
    preserveCorners = false,
) {
    for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1],
            b = points[index],
            length = dist(a, b);
        const count = Math.max(1, Math.ceil(length / step));
        let preserveEnd = false;
        if (preserveCorners && index < points.length - 1) {
            const next = points[index + 1];
            const incoming = { x: b.x - a.x, y: b.y - a.y };
            const outgoing = { x: next.x - b.x, y: next.y - b.y };
            const incomingLength = Math.hypot(incoming.x, incoming.y);
            const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
            const dot =
                incomingLength && outgoingLength
                    ? (incoming.x * outgoing.x + incoming.y * outgoing.y) /
                      (incomingLength * outgoingLength)
                    : 1;
            const previousZ = Number(a.z) || 0;
            const currentZ = Number(b.z) || 0;
            const nextZ = Number(next.z) || 0;
            const depthExtremum =
                (currentZ < previousZ && currentZ < nextZ) ||
                (currentZ > previousZ && currentZ > nextZ);
            preserveEnd = dot < 0.985 || depthExtremum;
        }
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            target.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * ratio,
                preserve:
                    preserveCorners &&
                    ((index === 1 && sample === 0) ||
                        (index === points.length - 1 && sample === count) ||
                        (preserveEnd && sample === count)),
                ...metadata,
            });
        }
    }
}

function paintSampleInto(grid, sample, geometry) {
    if (sample.z >= -0.0001) return;
    const { bounds, columns, rows, cellX, cellY } = geometry;
    const tangent = Math.tan((sample.angle * Math.PI) / 180 / 2);
    // A V-bit cuts a cone, not a slot: the footprint grows with tip depth
    // (surface half-width = depth * tan(half-angle)). Using the body diameter
    // here modelled it as a flat endmill, so v-carves rendered as thin slots
    // instead of grooves that widen as the bit plunges deeper.
    const depth = -sample.z;
    const radius = sample.vbit
        ? Math.max(
              depth * tangent + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          )
        : Math.max(
              sample.cutter / 2 + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          );
    const minColumn = clamp(
        Math.floor((sample.x - radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const maxColumn = clamp(
        Math.ceil((sample.x + radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const minRow = clamp(
        Math.floor((sample.y - radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    const maxRow = clamp(
        Math.ceil((sample.y + radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    for (let row = minRow; row <= maxRow; row += 1) {
        const y = bounds.minY + (row + 0.5) * cellY;
        for (let column = minColumn; column <= maxColumn; column += 1) {
            const x = bounds.minX + (column + 0.5) * cellX;
            const radial = Math.hypot(x - sample.x, y - sample.y);
            if (radial > radius) continue;
            const ball =
                sample.cutterType === 'ball' ||
                sample.cutterType === 'ballnose';
            const ballRadius = sample.cutter / 2;
            const z = sample.surfaceTip
                ? ballTipCutterSurfaceZ(sample.z, radial, ballRadius)
                : sample.vbit
                  ? Math.min(0, sample.z + radial / tangent)
                  : ball
                    ? Math.min(
                          0,
                          sample.z +
                              ballRadius -
                              Math.sqrt(
                                  Math.max(
                                      0,
                                      ballRadius * ballRadius - radial * radial,
                                  ),
                              ),
                      )
                    : sample.z;
            grid[row * columns + column] = Math.min(
                grid[row * columns + column],
                z,
            );
        }
    }
}

const yieldWorker = () => new Promise((resolve) => setTimeout(resolve, 0));

function pathLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1)
        length += dist(points[index - 1], points[index]);
    return length;
}

function estimatedSampleLength(toolpaths) {
    return toolpaths.reduce((total, toolpath) => {
        if (toolpath.motionPaths?.length)
            return (
                total +
                toolpath.motionPaths.reduce(
                    (sum, path) => sum + pathLength(path.points || []),
                    0,
                )
            );
        const contourLength = (toolpath.previewContours || []).reduce(
            (sum, contour) => sum + pathLength(contour),
            0,
        );
        return (
            total +
            contourLength * Math.max(1, toolpath.passDepths?.length || 0)
        );
    }, 0);
}

function sampleLengthForToolpath(toolpath) {
    return estimatedSampleLength([toolpath]);
}

async function build(version, toolpaths, stock) {
    const bounds = boundsFor(toolpaths, stock);
    if (!bounds) {
        self.postMessage({ type: 'empty', version });
        return;
    }
    const maxDiameter = Math.max(
        1,
        ...toolpaths.map((path) => Number(path.toolDiameter) || 1),
    );
    const hasJobStock =
        Number(stock?.widthMm) > 0 && Number(stock?.heightMm) > 0;
    if (!hasJobStock) {
        const padding = Math.max(8, maxDiameter * 1.5);
        bounds.minX -= padding;
        bounds.minY -= padding;
        bounds.maxX += padding;
        bounds.maxY += padding;
    }
    const width = Math.max(1, bounds.maxX - bounds.minX),
        height = Math.max(1, bounds.maxY - bounds.minY);
    const minCutter = Math.max(
        0.2,
        Math.min(...toolpaths.map((path) => Number(path.toolDiameter) || 1)),
    );
    const cell = Math.max(
        0.1,
        // Target at least twelve height samples across the smallest cutter.
        // The former 0.16 multiplier produced only five or six samples across
        // a 6.35 mm cutter on a 2 m sheet, which made curves visibly stair-step
        // at inspection zoom.
        Math.min(minCutter * 0.08, Math.max(width, height) / 960),
    );
    // One texel represents a cell centre. The renderer gives every texel its
    // own flat top face and draws the vertical steps in a second GPU pass.
    let columns = Math.min(4096, Math.max(56, Math.ceil(width / cell)));
    let rows = Math.min(4096, Math.max(56, Math.ceil(height / cell)));
    // Profiles reveal the actual height-field resolution at their vertical
    // walls. Leave enough cells for them to look like curved cutter paths,
    // while keeping the mesh comfortably below a typical WebGL memory limit.
    // Instanced row strips keep geometry tiny; the height texture is the main
    // cost. A 4096²-class cap retains fine cutter detail on full sheets while
    // remaining within common WebGL texture limits.
    const maxCells = 16000000;
    if (columns * rows > maxCells) {
        const reduction = Math.sqrt((columns * rows) / maxCells);
        columns = Math.max(56, Math.floor(columns / reduction));
        rows = Math.max(56, Math.floor(rows / reduction));
    }
    const cellX = width / columns,
        cellY = height / rows;
    // This is a visual replay, not the machining source of truth. V-carves can
    // contain hundreds of thousands of tiny G-code segments, so cap the mesh
    // workload while retaining a sample density that resolves the cutter.
    const maxSamples = 45000;
    const baseStep = Math.max(Math.max(cellX, cellY) * 0.85, minCutter * 0.18);
    let samples = [];
    self.postMessage({ type: 'progress', version, progress: 0, total: 0 });
    await yieldWorker();
    const lengths = toolpaths.map(sampleLengthForToolpath);
    const totalLength = Math.max(
        1,
        lengths.reduce((sum, length) => sum + length, 0),
    );
    const minimumPerToolpath = Math.min(
        6000,
        Math.floor(maxSamples / Math.max(1, toolpaths.length)),
    );
    const distributableSamples = Math.max(
        0,
        maxSamples - minimumPerToolpath * toolpaths.length,
    );
    for (
        let toolpathIndex = 0;
        toolpathIndex < toolpaths.length;
        toolpathIndex += 1
    ) {
        const toolpath = toolpaths[toolpathIndex];
        // Do not let a dense V-carve steal the profile's sampling budget. A
        // profile gets a guaranteed minimum, then the remaining budget is
        // distributed by cutting length.
        const sampleBudget = Math.max(
            1,
            minimumPerToolpath +
                Math.floor(
                    (distributableSamples * lengths[toolpathIndex]) /
                        totalLength,
                ),
        );
        const step = Math.max(baseStep, lengths[toolpathIndex] / sampleBudget);
        const toolpathSamples = [];
        const cutter = Math.max(0.1, Number(toolpath.toolDiameter) || 1);
        const metadata = {
            cutter,
            cutterType: toolpath.cutterType || 'flat',
            surfaceTip: Boolean(toolpath.surfaceTip),
            trochoidRadius: toolpath.trochoidEnabled
                ? Math.max(0, Number(toolpath.trochoidRadius) || 0)
                : 0,
            // CAM uses `vcarve` as its operation id. Keep the legacy spelling as
            // compatibility for saved projects created before the id was aligned.
            vbit:
                toolpath.operation === 'vcarve' ||
                toolpath.operation === 'v-carve' ||
                toolpath.operation === 'chamfer' ||
                toolpath.operation === 'countersink',
            angle: clamp(Number(toolpath.cutterAngle) || 90, 10, 170),
        };
        if (toolpath.motionPaths?.length) {
            for (const path of toolpath.motionPaths)
                addMotionSamples(
                    toolpathSamples,
                    path.points || [],
                    step,
                    metadata,
                    metadata.vbit,
                );
        } else {
            for (const depth of toolpath.passDepths || []) {
                for (const contour of toolpath.previewContours || [])
                    addContourSamples(
                        toolpathSamples,
                        toolpath,
                        contour,
                        depth,
                        step,
                        metadata,
                    );
            }
        }
        samples.push(...capPreviewSamples(toolpathSamples, sampleBudget));
    }
    if (version !== latestBuildVersion) return;
    self.postMessage({
        type: 'progress',
        version,
        progress: 0,
        total: samples.length,
    });
    const grid = new Float32Array(columns * rows);
    const geometry = { bounds, columns, rows, cellX, cellY };
    for (let index = 0; index < samples.length; index += 1) {
        paintSampleInto(grid, samples[index], geometry);
        if (index % 750 === 0) {
            if (version !== latestBuildVersion) return;
            self.postMessage({
                type: 'progress',
                version,
                progress: Math.round(
                    (index / Math.max(1, samples.length)) * 100,
                ),
                total: samples.length,
            });
            await yieldWorker();
        }
    }
    if (version !== latestBuildVersion) return;
    let minZ = 0;
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const value = grid[row * columns + column];
            minZ = Math.min(minZ, value);
        }
    }
    const sampleData = new Float32Array(samples.length * 6);
    const sampleKinds = new Uint8Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index],
            offset = index * 6;
        sampleData[offset] = sample.x;
        sampleData[offset + 1] = sample.y;
        sampleData[offset + 2] = sample.z;
        sampleData[offset + 3] = sample.cutter;
        sampleData[offset + 4] = sample.trochoidRadius;
        sampleData[offset + 5] = sample.angle;
        sampleKinds[index] = sample.vbit
            ? 1
            : sample.cutterType === 'ball' || sample.cutterType === 'ballnose'
              ? 2
              : 0;
    }
    self.postMessage(
        {
            type: 'complete',
            version,
            bounds,
            grid: grid.buffer,
            sampleData: sampleData.buffer,
            sampleKinds: sampleKinds.buffer,
            columns,
            rows,
            cellX,
            cellY,
            maxDepth: Math.max(1, Number(stock?.thicknessMm) || -minZ),
            material: stock?.material || 'sheet-goods',
        },
        [grid.buffer, sampleData.buffer, sampleKinds.buffer],
    );
}

self.addEventListener('message', ({ data }) => {
    if (data?.type !== 'build') return;
    latestBuildVersion = data.version;
    build(data.version, data.toolpaths || [], data.stock).catch((error) => {
        if (data.version === latestBuildVersion)
            self.postMessage({
                type: 'error',
                version: data.version,
                message: error?.message || '3D simulation failed.',
            });
    });
});
