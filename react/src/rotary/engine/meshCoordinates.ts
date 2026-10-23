import type { SurfacePoint, SurfaceMesh } from '../../engine/surface-cam';
import type { StlMesh } from './types';

/** Positive A rotates machine Y towards Z about +X. */
export function rotateAboutX(p: SurfacePoint, angle: number): SurfacePoint {
    const a = (angle * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}
export function toolInMaterial(p: SurfacePoint, a: number): SurfacePoint {
    return rotateAboutX(p, -a);
}
/** Viewer Y is up; machine Z is up. Preserve the original triangles. */
export function rotarySurfaceMesh(mesh: StlMesh, angle: number): SurfaceMesh {
    const vertices = new Float32Array(mesh.positions.length);
    const bounds = {
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
    };
    for (let i = 0; i < vertices.length; i += 3) {
        const p = rotateAboutX(
            {
                x: mesh.positions[i],
                y: mesh.positions[i + 2],
                z: mesh.positions[i + 1],
            },
            angle,
        );
        vertices.set([p.x, p.y, p.z], i);
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y);
        bounds.maxY = Math.max(bounds.maxY, p.y);
        bounds.minZ = Math.min(bounds.minZ, p.z);
        bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
    return { vertices, bounds, sourceName: mesh.name };
}
export function validateRotaryMesh(mesh: StlMesh): void {
    const v = mesh.positions;
    if (
        !v.length ||
        v.length % 9 ||
        v.length > 900_000 ||
        mesh.triangles !== v.length / 9
    )
        throw new Error(
            'STL must contain between 1 and 100,000 complete triangles.',
        );
    const edges = new Map<string, { count: number; balance: number }>();
    const key = (i: number) =>
        [v[i], v[i + 1], v[i + 2]]
            .map((n) => {
                if (!Number.isFinite(n) || Math.abs(n) > 100_000)
                    throw new Error(
                        'STL contains non-finite or out-of-range coordinates.',
                    );
                return Math.round(n * 100_000);
            })
            .join(',');
    for (let i = 0; i < v.length; i += 9) {
        const keys = [key(i), key(i + 3), key(i + 6)];
        const ux = v[i + 3] - v[i],
            uy = v[i + 4] - v[i + 1],
            uz = v[i + 5] - v[i + 2];
        const vx = v[i + 6] - v[i],
            vy = v[i + 7] - v[i + 1],
            vz = v[i + 8] - v[i + 2];
        if (
            new Set(keys).size !== 3 ||
            Math.hypot(
                uy * vz - uz * vy,
                uz * vx - ux * vz,
                ux * vy - uy * vx,
            ) < 1e-10
        )
            throw new Error(
                'STL contains degenerate triangles. Repair the mesh.',
            );
        for (let k = 0; k < 3; k++) {
            const a = keys[k],
                b = keys[(k + 1) % 3],
                edge = a < b ? `${a}|${b}` : `${b}|${a}`;
            const entry = edges.get(edge) ?? { count: 0, balance: 0 };
            entry.count++;
            entry.balance += a < b ? 1 : -1;
            edges.set(edge, entry);
        }
    }
    if ([...edges.values()].some((e) => e.count !== 2 || e.balance !== 0))
        throw new Error(
            'STL must be a closed, consistently oriented manifold. Repair open edges or nonmanifold faces.',
        );
}
