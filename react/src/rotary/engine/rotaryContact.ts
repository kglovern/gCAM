import type { StlMesh } from './types';

type Point = { x: number; y: number; z: number };

function inside(x: number, y: number, a: Point, b: Point, c: Point) {
    const cross = (p: Point, q: Point) =>
        (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
    const u = cross(a, b),
        v = cross(b, c),
        w = cross(c, a);
    return (
        (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) ||
        (u <= 1e-9 && v <= 1e-9 && w <= 1e-9)
    );
}

/** Highest sphere-centre (ball) or tip (flat) Z in contact with a triangle.
 * Face, edge and vertex extrema are all considered; no turning silhouette. */
export function triangleContact(
    a: Point,
    b: Point,
    c: Point,
    x: number,
    radius: number,
    ball: boolean,
) {
    let height = -Infinity;
    for (let edge = 0; edge < 3; edge++) {
        const p = edge === 0 ? a : edge === 1 ? b : c;
        const q = edge === 0 ? b : edge === 1 ? c : a;
        const dx = q.x - p.x,
            dy = q.y - p.y,
            dz = q.z - p.z;
        const ux = p.x - x,
            uy = p.y,
            length2 = dx * dx + dy * dy;
        if (length2 < 1e-20) {
            const h2 = radius * radius - ux * ux - uy * uy;
            if (h2 >= -1e-10)
                height = Math.max(
                    height,
                    Math.max(p.z, q.z) +
                        (ball ? Math.sqrt(Math.max(0, h2)) : 0),
                );
            continue;
        }
        const t0 = -(ux * dx + uy * dy) / length2;
        const h2 = radius * radius - (ux * ux + uy * uy - t0 * t0 * length2);
        if (h2 < -1e-10) continue;
        const span = Math.sqrt(Math.max(0, h2) / length2);
        const lo = Math.max(0, t0 - span),
            hi = Math.min(1, t0 + span);
        if (lo > hi) continue;
        const optimum = ball
            ? t0 +
              dz * Math.sqrt(Math.max(0, h2) / (length2 * (length2 + dz * dz)))
            : dz >= 0
              ? hi
              : lo;
        const t = Math.max(lo, Math.min(hi, optimum));
        const px = ux + t * dx,
            py = uy + t * dy;
        height = Math.max(
            height,
            p.z +
                t * dz +
                (ball
                    ? Math.sqrt(
                          Math.max(0, radius * radius - px * px - py * py),
                      )
                    : 0),
        );
    }
    const ux = b.x - a.x,
        uy = b.y - a.y,
        uz = b.z - a.z;
    const vx = c.x - a.x,
        vy = c.y - a.y,
        vz = c.z - a.z;
    const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
    if (Math.abs(nz) > 1e-15) {
        const gx = -nx / nz,
            gy = -ny / nz;
        if (ball) {
            const norm = Math.hypot(nx, ny, nz),
                sign = Math.sign(nz);
            const qx = x - (radius * nx * sign) / norm,
                qy = (-radius * ny * sign) / norm;
            if (inside(qx, qy, a, b, c))
                height = Math.max(
                    height,
                    a.z +
                        gx * (x - a.x) -
                        gy * a.y +
                        (radius * norm) / Math.abs(nz),
                );
        } else {
            const norm = Math.hypot(gx, gy);
            const qx = norm ? x + (radius * gx) / norm : x,
                qy = norm ? (radius * gy) / norm : 0;
            if (inside(qx, qy, a, b, c))
                height = Math.max(
                    height,
                    a.z + gx * (qx - a.x) + gy * (qy - a.y),
                );
        }
    }
    return Math.min(height, Math.max(a.z, b.z, c.z) + (ball ? radius : 0));
}

/** Rotation is applied to the original STL at each queried A position. */
export function createRotaryContact(mesh: StlMesh, maxReach: number) {
    const v = mesh.positions,
        width = Math.max(1, maxReach);
    const bins = new Map<number, number[]>();
    const minX = new Float64Array(v.length / 9);
    const maxX = new Float64Array(v.length / 9);
    const a: Point = { x: 0, y: 0, z: 0 };
    const b: Point = { x: 0, y: 0, z: 0 };
    const c: Point = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < v.length; i += 9) {
        minX[i / 9] = Math.min(v[i], v[i + 3], v[i + 6]);
        maxX[i / 9] = Math.max(v[i], v[i + 3], v[i + 6]);
        const lo = Math.floor(
            (Math.min(v[i], v[i + 3], v[i + 6]) - maxReach) / width,
        );
        const hi = Math.floor(
            (Math.max(v[i], v[i + 3], v[i + 6]) + maxReach) / width,
        );
        for (let bin = lo; bin <= hi; bin++) {
            const group = bins.get(bin) ?? [];
            group.push(i);
            bins.set(bin, group);
        }
    }
    return (x: number, angle: number, radius: number, ball: boolean) => {
        if (radius > maxReach + 1e-8)
            throw new Error('Cutter contact query exceeds its geometry index.');
        const radians = (angle * Math.PI) / 180,
            co = Math.cos(radians),
            si = Math.sin(radians);
        let height = -Infinity;
        for (const i of bins.get(Math.floor(x / width)) ?? []) {
            if (minX[i / 9] > x + radius || maxX[i / 9] < x - radius) continue;
            a.z = v[i + 2] * si + v[i + 1] * co;
            b.z = v[i + 5] * si + v[i + 4] * co;
            c.z = v[i + 8] * si + v[i + 7] * co;
            // A triangle below the current contact cannot raise the cutter.
            if (Math.max(a.z, b.z, c.z) + (ball ? radius : 0) <= height)
                continue;
            a.x = v[i];
            b.x = v[i + 3];
            c.x = v[i + 6];
            a.y = v[i + 2] * co - v[i + 1] * si;
            b.y = v[i + 5] * co - v[i + 4] * si;
            c.y = v[i + 8] * co - v[i + 7] * si;
            if (
                Math.min(a.y, b.y, c.y) > radius ||
                Math.max(a.y, b.y, c.y) < -radius
            )
                continue;
            height = Math.max(
                height,
                triangleContact(a, b, c, x, radius, ball),
            );
        }
        return height;
    };
}
