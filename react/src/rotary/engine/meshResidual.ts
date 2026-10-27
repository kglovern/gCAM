import { rotateAboutX, rotarySurfaceMesh } from './meshCoordinates';
import type { RotaryTool, StlMesh, ToolpathMove } from './types';

/** Independent sampled cutter-volume check. A finite probe set can reject a
 * bad path, but cannot certify that an arbitrary continuous surface is finished. */
export function meshResidual(
    mesh: StlMesh,
    moves: ToolpathMove[],
    tool: RotaryTool,
    tolerance: number,
) {
    const { vertices: v, bounds } = rotarySurfaceMesh(mesh, 0),
        radius = tool.dia / 2;
    const probes: { x: number; y: number; z: number; distance: number }[] = [];
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < v.length; i += 9) {
        if (
            [0, 3, 6].every((k) => Math.abs(v[i + k] - bounds.minX) < 1e-5) ||
            [0, 3, 6].every((k) => Math.abs(v[i + k] - bounds.maxX) < 1e-5)
        )
            continue;
        for (const weights of [
            [1 / 3, 1 / 3, 1 / 3],
            [0.6, 0.2, 0.2],
            [0.2, 0.6, 0.2],
            [0.2, 0.2, 0.6],
        ]) {
            const p = { x: 0, y: 0, z: 0, distance: Infinity };
            for (let k = 0; k < 3; k++) {
                p.x += v[i + k * 3] * weights[k];
                p.y += v[i + k * 3 + 1] * weights[k];
                p.z += v[i + k * 3 + 2] * weights[k];
            }
            const bucket = Math.floor(p.x / tool.dia),
                index = probes.length;
            probes.push(p);
            const group = buckets.get(bucket) ?? [];
            group.push(index);
            buckets.set(bucket, group);
        }
    }
    let checks = 0,
        minClearance = Infinity;
    // Indexed paths reuse a pose. Index both lateral coordinates so dense
    // meshes do not compare every move with an entire axial slice.
    const indexed =
        new Set(moves.filter((m) => !m.rapid).map((m) => m.a)).size <= 360;
    let poseAngle: number | undefined;
    let pose: { x: number; y: number; z: number }[] = [];
    const poseBuckets = new Map<string, number[]>();
    const reach = radius + tolerance;
    for (const m of moves) {
        if (m.rapid) continue;
        if (
            m.x === undefined ||
            m.y === undefined ||
            m.z === undefined ||
            m.a === undefined
        )
            throw new Error(
                'Residual verification requires explicit XYZA coordinates.',
            );
        const base = Math.floor(m.x / tool.dia);
        const candidates: number[] = [];
        if (indexed) {
            if (poseAngle !== m.a) {
                poseAngle = m.a;
                poseBuckets.clear();
                pose = probes.map((probe, index) => {
                    const point = rotateAboutX(probe, m.a!);
                    const key = `${Math.floor(point.x / tool.dia)},${Math.floor(point.y / tool.dia)}`;
                    const group = poseBuckets.get(key) ?? [];
                    group.push(index);
                    poseBuckets.set(key, group);
                    return point;
                });
            }
            for (
                let x = Math.floor((m.x - reach) / tool.dia);
                x <= Math.floor((m.x + reach) / tool.dia);
                x++
            )
                for (
                    let y = Math.floor((m.y - reach) / tool.dia);
                    y <= Math.floor((m.y + reach) / tool.dia);
                    y++
                )
                    candidates.push(...(poseBuckets.get(`${x},${y}`) ?? []));
        } else {
            for (let bucket = base - 1; bucket <= base + 1; bucket++)
                candidates.push(...(buckets.get(bucket) ?? []));
        }
        for (const index of candidates) {
            const probe = probes[index];
            if (Math.abs(probe.x - m.x) > radius + tolerance) continue;
            const p = indexed ? pose[index] : rotateAboutX(probe, m.a);
            if (Math.abs(p.y - m.y) > reach || p.z < m.z - tolerance) continue;
            const radial = Math.hypot(p.x - m.x, p.y - m.y);
            if (radial > reach) continue;
            if (++checks > 20_000_000)
                throw new Error(
                    'Surface residual verification exceeds its 20-million-check limit. Simplify the mesh or split the job.',
                );
            let distance: number;
            if (tool.type === 'ball' && p.z < m.z + radius)
                distance = Math.hypot(radial, p.z - m.z - radius) - radius;
            else {
                const side = radial - radius,
                    bottom = m.z - p.z;
                distance =
                    Math.hypot(Math.max(side, 0), Math.max(bottom, 0)) +
                    Math.min(Math.max(side, bottom), 0);
            }
            probe.distance = Math.min(probe.distance, distance);
            minClearance = Math.min(minClearance, distance);
        }
    }
    let unresolved = 0,
        maxResidual = 0;
    for (const p of probes) {
        if (p.distance > tolerance) unresolved++;
        maxResidual = Math.max(maxResidual, p.distance);
    }
    return {
        samples: probes.length,
        unresolved,
        maxResidual,
        minClearance,
        checks,
    };
}
