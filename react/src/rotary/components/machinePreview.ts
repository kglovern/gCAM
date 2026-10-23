import * as THREE from 'three';
import type { RotaryStock } from '../engine/types';

export const alignmentFields = [
    ['x', 'Machine X', 'mm'],
    ['y', 'Machine Y', 'mm'],
    ['z', 'Machine Z', 'mm'],
    ['rx', 'Rotation X', '°'],
    ['ry', 'Rotation Y', '°'],
    ['rz', 'Rotation Z', '°'],
    ['jawProjection', 'Jaw projection', 'mm'],
    ['jawOffset', 'Jaw radial trim', 'mm'],
    ['tailOffset', 'Tailstock trim', 'mm'],
] as const;
export type AlignmentKey = (typeof alignmentFields)[number][0];
export type MachineAlignment = Record<AlignmentKey, number>;
export const defaultAlignment: MachineAlignment = {
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    jawProjection: 15.8,
    jawOffset: 0,
    tailOffset: 0,
};
export const alignmentStorageKey = 'gcam.rotary.machine-alignment.v1';

interface MachinePose {
    length: number;
    diameter: number;
    alignment: MachineAlignment;
}

export function interpolateMachinePose(
    from: MachinePose,
    to: MachinePose,
    elapsed: number,
): MachinePose {
    if (elapsed >= 450) return to;
    const t = Math.min(1, Math.max(0, elapsed / 450));
    const eased = t * t * (3 - 2 * t);
    const lerp = (a: number, b: number) => a + (b - a) * eased;
    const alignment = { ...to.alignment };
    for (const [key] of alignmentFields)
        alignment[key] = lerp(from.alignment[key], to.alignment[key]);
    return {
        length: lerp(from.length, to.length),
        diameter: lerp(from.diameter, to.diameter),
        alignment,
    };
}

export function readAlignment(value: string | null): MachineAlignment {
    try {
        const parsed = JSON.parse(value || '{}');
        const result = { ...defaultAlignment };
        for (const [key] of alignmentFields) {
            if (
                typeof parsed?.[key] === 'number' &&
                Number.isFinite(parsed[key]) &&
                Math.abs(parsed[key]) <= 10000
            )
                result[key] = parsed[key];
        }
        return result;
    } catch {
        return { ...defaultAlignment };
    }
}

/** GLB vertices are metres; the rotary scene and calibration controls use mm. */
export function poseMachine(
    root: THREE.Group,
    stock: Pick<RotaryStock, 'length' | 'diameter'>,
    alignment: MachineAlignment,
) {
    root.position.set(alignment.x, alignment.y, alignment.z);
    root.rotation.set(
        ...([alignment.rx, alignment.ry, alignment.rz].map(
            THREE.MathUtils.degToRad,
        ) as [number, number, number]),
    );
    root.traverse((object) => {
        const data = object.userData;
        if (data.rotaryRole === 'tailstock') {
            object.position.x =
                (stock.length - data.tipX + alignment.tailOffset) / 1000;
        } else if (data.rotaryRole === 'jaw') {
            const distance =
                stock.diameter / 2 - data.contactRadius + alignment.jawOffset;
            object.position
                .fromArray(data.radialDirection)
                .multiplyScalar(distance / 1000);
            object.position.x =
                (alignment.jawProjection - defaultAlignment.jawProjection) /
                1000;
        }
    });
    root.updateMatrixWorld(true);
}

export function disposeMachine(root: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            for (const material of Array.isArray(object.material)
                ? object.material
                : [object.material])
                materials.add(material);
        }
    });
    materials.forEach((material) => material.dispose());
}

export function machineViewFit(box: THREE.Box3, aspect: number, fov: number) {
    const center = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(0.25, 0.55, 1).normalize();
    const right = new THREE.Vector3()
        .crossVectors(THREE.Object3D.DEFAULT_UP, direction)
        .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    let distance = 1;
    for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
                const corner = new THREE.Vector3(x, y, z).sub(center);
                distance = Math.max(
                    distance,
                    corner.dot(direction) +
                        Math.abs(corner.dot(right)) /
                            (tangent * Math.max(0.1, aspect)),
                    corner.dot(direction) + Math.abs(corner.dot(up)) / tangent,
                );
            }
    distance *= 1.12;
    return {
        center,
        position: center.clone().addScaledVector(direction, distance),
        distance,
    };
}
