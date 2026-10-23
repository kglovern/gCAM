import type { HeightField } from '../../engine/surface-cam';
import { rotarySurfaceMesh } from './meshCoordinates';
import type { StlMesh } from './types';

/** Conservative sampled visibility diagnostic, not a completeness certificate.
 * Faces that cannot be seen in the chosen indexed poses must not be silently
 * treated as finished. Attachment end caps are explicitly excluded. */
export function createMeshAccess(mesh: StlMesh) {
    const seen = new Uint8Array(mesh.triangles);
    const zero = rotarySurfaceMesh(mesh, 0);
    for (let i = 0; i < zero.vertices.length; i += 9) {
        const v = zero.vertices;
        if (
            [0, 3, 6].every(
                (k) => Math.abs(v[i + k] - zero.bounds.minX) < 1e-5,
            ) ||
            [0, 3, 6].every((k) => Math.abs(v[i + k] - zero.bounds.maxX) < 1e-5)
        )
            seen[i / 9] = 1;
    }
    return {
        observe(angle: number, field: HeightField, guard: number) {
            const { vertices: v } = rotarySurfaceMesh(mesh, angle);
            for (let i = 0; i < v.length; i += 9) {
                if (seen[i / 9]) continue;
                const x = (v[i] + v[i + 3] + v[i + 6]) / 3,
                    y = (v[i + 1] + v[i + 4] + v[i + 7]) / 3,
                    z = (v[i + 2] + v[i + 5] + v[i + 8]) / 3;
                if (z < 0) continue;
                const ux = v[i + 3] - v[i],
                    uy = v[i + 4] - v[i + 1],
                    uz = v[i + 5] - v[i + 2];
                const vx = v[i + 6] - v[i],
                    vy = v[i + 7] - v[i + 1],
                    vz = v[i + 8] - v[i + 2];
                const nx = uy * vz - uz * vy,
                    ny = uz * vx - ux * vz,
                    nz = ux * vy - uy * vx;
                if (Math.abs(nz) < Math.hypot(nx, ny, nz) * 0.2) continue;
                const row = Math.round(
                        (y - field.bounds.minY) / field.cellSize,
                    ),
                    col = Math.round((x - field.bounds.minX) / field.cellSize);
                if (
                    row < 0 ||
                    col < 0 ||
                    row >= field.rows ||
                    col >= field.columns
                )
                    continue;
                const height = field.heights[row * field.columns + col];
                const tolerance =
                    guard +
                    field.cellSize *
                        (Math.abs(nx / nz) + Math.abs(ny / nz)) *
                        1.5 +
                    1e-4;
                if (Number.isFinite(height) && height - z <= tolerance)
                    seen[i / 9] = 1;
            }
        },
        unresolved: () => seen.reduce((total, n) => total + (n ? 0 : 1), 0),
    };
}
