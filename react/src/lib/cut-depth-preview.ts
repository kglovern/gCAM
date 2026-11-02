import { buildGcode } from '../cam/gcode/program.js';
import { buildMovementVerticesFromLines } from '@sienci/gviewer';
import { compositePocketSeedPaths } from '../cam/geometry/polygons.js';
import { pocketDepthRGB } from '../canvas/pocketDepthPreview';

export type DepthPreviewImage = {
    width: number;
    height: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    light: Uint8ClampedArray;
    dark: Uint8ClampedArray;
    depths: number[];
    operations: string[];
    stockThickness?: number;
    cellMm: number;
};
type Point = { x: number; y: number; z: number };
type Cutter = { radius: number; type: string; angle: number };
export const DEPTH_PREVIEW_OPERATIONS = [
    'pocket',
    'profile-outside',
    'profile-inside',
    'engrave',
    'chamfer',
    'vcarve',
];

/** Deepest ideal cutter contact along a linear XYZ move, including ramp slopes. */
export function segmentCutDepth(
    p: { x: number; y: number },
    a: Point,
    b: Point,
    tool: Cutter,
) {
    const dx = b.x - a.x,
        dy = b.y - a.y,
        L = Math.hypot(dx, dy),
        R = tool.radius;
    if (!(R > 0)) return 0;
    let radial: number, depth: number;
    if (L < 1e-9) {
        radial = Math.hypot(p.x - a.x, p.y - a.y);
        depth = Math.max(-a.z, -b.z);
    } else {
        const q = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L,
            h = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
        if (h > R) return 0;
        const reach = Math.sqrt(Math.max(0, R * R - h * h)),
            lo = Math.max(0, q - reach),
            hi = Math.min(L, q + reach);
        if (lo > hi) return 0;
        const k = (a.z - b.z) / L;
        let s: number;
        if (tool.type === 'v-bit') {
            const m = k * Math.tan((tool.angle * Math.PI) / 360);
            s =
                Math.abs(m) >= 1
                    ? m > 0
                        ? hi
                        : lo
                    : q + (m * h) / Math.sqrt(1 - m * m);
        } else if (tool.type === 'ball' || tool.type === 'ballnose')
            s = q + (k * reach) / Math.sqrt(1 + k * k);
        else s = k > 0 ? hi : lo;
        s = Math.max(lo, Math.min(hi, s));
        radial = Math.hypot(s - q, h);
        depth = -a.z + k * s;
    }
    if (radial > R + 1e-8) return 0;
    const rise =
        tool.type === 'v-bit'
            ? radial / Math.tan((tool.angle * Math.PI) / 360)
            : tool.type === 'ball' || tool.type === 'ballnose'
              ? R - Math.sqrt(Math.max(0, R * R - radial * radial))
              : 0;
    return Math.max(0, depth - rise);
}

export function cutDepthPixels(
    depths: Float32Array,
    width: number,
    height: number,
    stockThickness?: number,
    cellMm = 0.08,
) {
    const images = [
        new Uint8ClampedArray(depths.length * 4),
        new Uint8ClampedArray(depths.length * 4),
    ];
    const shadows = new Float32Array(depths.length),
        fade = Math.exp(-cellMm / 0.65);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x,
                d = depths[i];
            if (d <= 1e-5) continue;
            const through =
                stockThickness !== undefined && d >= stockThickness - 1e-4;
            const left = x ? depths[i - 1] : 0,
                top = y ? depths[i - width] : 0;
            // A soft inner shadow is a visual depth cue, not additional cut depth.
            const rim = Math.max(
                Math.min(0.28, Math.max(0, d - Math.min(left, top)) * 0.09),
                x && left <= d + 1e-5 ? shadows[i - 1] * fade : 0,
                y && top <= d + 1e-5 ? shadows[i - width] * fade : 0,
            );
            shadows[i] = rim;
            for (let theme = 0; theme < 2; theme++) {
                const rgb = through
                    ? theme
                        ? [5, 9, 16]
                        : [100, 116, 139]
                    : pocketDepthRGB(d, !!theme);
                for (let c = 0; c < 3; c++)
                    images[theme][i * 4 + c] = Math.round(rgb[c] * (1 - rim));
                images[theme][i * 4 + 3] = 255;
            }
        }
    return { light: images[0], dark: images[1] };
}

/** Bounded, off-thread depth cue; does not change geometry or exported programs. */
export function buildCutDepthPreview(
    toolpaths: Record<string, any>[],
    stockThickness?: number,
): DepthPreviewImage {
    if (
        !toolpaths.length ||
        toolpaths.some((t) => !DEPTH_PREVIEW_OPERATIONS.includes(t.operation))
    )
        throw new Error('Unsupported depth preview operation.');
    if (
        stockThickness !== undefined &&
        (!Number.isFinite(stockThickness) || stockThickness <= 0)
    )
        throw new Error('Invalid depth preview stock.');
    let sourcePoints = 0,
        work = 0;
    const jobs = toolpaths.map((t) => {
        const paths =
            t.operation === 'vcarve'
                ? (t.motionPaths ?? []).map((p: any) => p.points)
                : (t.previewContours ?? []);
        for (const path of paths)
            sourcePoints +=
                path.length *
                Math.max(
                    1,
                    t.operation === 'vcarve' ? 1 : (t.passDepths?.length ?? 1),
                );
        if (sourcePoints > 250000)
            throw new Error(
                'Depth preview is too detailed; toolpath lines remain available.',
            );
        const type =
                t.cutterType ??
                (t.operation === 'vcarve' || t.operation === 'chamfer'
                    ? 'v-bit'
                    : 'flat'),
            radius = Number(t.toolDiameter) / 2,
            angle = Number(t.cutterAngle ?? 90);
        if (
            !Number.isFinite(radius) ||
            radius <= 0 ||
            radius > 10000 ||
            !['flat', 'v-bit', 'ball', 'ballnose'].includes(type) ||
            (type === 'v-bit' &&
                (!Number.isFinite(angle) || angle <= 0 || angle >= 180))
        )
            throw new Error('Unsupported depth preview cutter.');
        const code = buildGcode({
            toolpaths: [t],
            fileName: 'depth-preview',
            forcePolylineArcs: true,
        });
        if (code.length > 16000000)
            throw new Error('Depth preview program is too large.');
        const positions = buildMovementVerticesFromLines(
            code.split(/\r?\n/),
        ).cutting;
        if (positions.length > 1500000)
            throw new Error('Depth preview has too many moves.');
        const clip =
            t.operation === 'chamfer' && t.chamferWidthMm !== undefined
                ? compositePocketSeedPaths(t.sourceLoops ?? [], 1e-8)
                : null;
        return { positions, tool: { type, radius, angle }, clip };
    });
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const job of jobs)
        for (let i = 0; i < job.positions.length; i += 6) {
            const p = job.positions;
            if (Math.min(p[i + 2], p[i + 5]) >= 0) continue;
            for (const j of [i, i + 3]) {
                minX = Math.min(minX, p[j] - job.tool.radius);
                maxX = Math.max(maxX, p[j] + job.tool.radius);
                minY = Math.min(minY, p[j + 1] - job.tool.radius);
                maxY = Math.max(maxY, p[j + 1] + job.tool.radius);
            }
        }
    if (
        ![minX, minY, maxX, maxY].every(Number.isFinite) ||
        Math.max(
            Math.abs(minX),
            Math.abs(minY),
            Math.abs(maxX),
            Math.abs(maxY),
        ) > 1000000 ||
        maxX <= minX ||
        maxY <= minY
    )
        throw new Error('No cutting moves for depth preview.');
    const cellMm = Math.max(0.08, (maxX - minX) / 1024, (maxY - minY) / 1024),
        width = Math.max(1, Math.ceil((maxX - minX) / cellMm)),
        height = Math.max(1, Math.ceil((maxY - minY) / cellMm));
    maxX = minX + width * cellMm;
    maxY = minY + height * cellMm;
    const depths = new Float32Array(width * height);
    for (const job of jobs) {
        let mask: Uint8Array | null = null;
        if (job.clip) {
            if (!job.clip.length)
                throw new Error('Chamfer material outline is missing.');
            mask = new Uint8Array(width * height);
            for (let row = 0; row < height; row++) {
                const y = maxY - (row + 0.5) * cellMm,
                    xs: number[] = [];
                for (const contour of job.clip)
                    for (let i = 1; i < contour.length; i++) {
                        if (++work > 30000000)
                            throw new Error(
                                'Depth preview work limit reached.',
                            );
                        const a = contour[i - 1],
                            b = contour[i];
                        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
                            xs.push(
                                a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y),
                            );
                    }
                xs.sort((a, b) => a - b);
                for (let i = 0; i + 1 < xs.length; i += 2)
                    for (
                        let col = Math.max(
                            0,
                            Math.ceil((xs[i] - minX) / cellMm - 0.5),
                        );
                        col < width && minX + (col + 0.5) * cellMm < xs[i + 1];
                        col++
                    )
                        mask[row * width + col] = 1;
            }
        }
        const p = job.positions;
        for (let i = 0; i < p.length; i += 6) {
            const a = { x: p[i], y: p[i + 1], z: p[i + 2] },
                b = { x: p[i + 3], y: p[i + 4], z: p[i + 5] };
            if (Math.min(a.z, b.z) >= 0) continue;
            const R =
                job.tool.type === 'v-bit'
                    ? Math.min(
                          job.tool.radius,
                          Math.max(-a.z, -b.z) *
                              Math.tan((job.tool.angle * Math.PI) / 360),
                      )
                    : job.tool.radius;
            const first = Math.max(
                    0,
                    Math.floor((maxY - Math.max(a.y, b.y) - R) / cellMm),
                ),
                last = Math.min(
                    height - 1,
                    Math.ceil((maxY - Math.min(a.y, b.y) + R) / cellMm),
                );
            for (let row = first; row <= last; row++) {
                const y = maxY - (row + 0.5) * cellMm,
                    dy = b.y - a.y;
                let lo = 0,
                    hi = 1;
                if (Math.abs(dy) > 1e-9) {
                    const u = (y - R - a.y) / dy,
                        v = (y + R - a.y) / dy;
                    lo = Math.max(0, Math.min(u, v));
                    hi = Math.min(1, Math.max(u, v));
                    if (lo > hi) continue;
                }
                const x1 = a.x + (b.x - a.x) * lo,
                    x2 = a.x + (b.x - a.x) * hi;
                const start = Math.max(
                        0,
                        Math.floor((Math.min(x1, x2) - R - minX) / cellMm),
                    ),
                    end = Math.min(
                        width - 1,
                        Math.ceil((Math.max(x1, x2) + R - minX) / cellMm),
                    );
                for (let col = start; col <= end; col++) {
                    if (++work > 30000000)
                        throw new Error('Depth preview work limit reached.');
                    const index = row * width + col;
                    if (mask && !mask[index]) continue;
                    const d = segmentCutDepth(
                        { x: minX + (col + 0.5) * cellMm, y },
                        a,
                        b,
                        job.tool,
                    );
                    if (d > depths[index]) depths[index] = d;
                }
            }
        }
    }
    return {
        width,
        height,
        minX,
        minY,
        maxX,
        maxY,
        cellMm,
        stockThickness,
        ...cutDepthPixels(depths, width, height, stockThickness, cellMm),
        depths: [
            ...new Set(
                toolpaths
                    .map((t) => Number(t.cutDepth))
                    .filter((d) => Number.isFinite(d) && d > 0),
            ),
        ].sort((a, b) => a - b),
        operations: toolpaths.map((t) => t.operation),
    };
}
