import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
    defaultAlignment,
    machineViewFit,
    interpolateMachinePose,
    poseMachine,
    readAlignment,
} from './machinePreview';
const glb = fs.readFileSync(path.resolve('public/models/rotary/vortex.glb'));
const jsonLength = glb.readUInt32LE(12);
const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 20 + jsonLength + 8;
test.each([0.5, 2.2])(
    'machine fit keeps the full rail visible at aspect %s',
    (aspect) => {
        const box = new THREE.Box3(
            new THREE.Vector3(-200, -105, -60),
            new THREE.Vector3(670, 40, 60),
        );
        const view = machineViewFit(box, aspect, 40);
        const camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 5000);
        camera.position.copy(view.position);
        camera.lookAt(view.center);
        camera.updateMatrixWorld();
        for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
                for (const z of [box.min.z, box.max.z]) {
                    const point = new THREE.Vector3(x, y, z).project(camera);
                    expect(Math.abs(point.x)).toBeLessThan(1);
                    expect(Math.abs(point.y)).toBeLessThan(1);
                    expect(point.z).toBeGreaterThan(-1);
                    expect(point.z).toBeLessThan(1);
                }
    },
);
function vertices(node) {
    const accessor =
        model.accessors[
            model.meshes[node.mesh].primitives[0].attributes.POSITION
        ];
    const view = model.bufferViews[accessor.bufferView];
    const start = binaryOffset + view.byteOffset;
    return new Float32Array(
        Uint8Array.from(glb.subarray(start, start + view.byteLength)).buffer,
    );
}
function machine() {
    const root = new THREE.Group(),
        scene = new THREE.Group();
    scene.scale.setScalar(1000);
    root.add(scene);
    function add(index, parent) {
        const source = model.nodes[index],
            object = new THREE.Group();
        object.userData = source.extras || {};
        object.name = source.name;
        parent.add(object);
        for (const child of source.children || []) add(child, object);
    }
    add(0, scene);
    return root;
}
test('converted assembly preserves four jaws and a complete movable tailstock', () => {
    expect(
        model.nodes.filter((n) => n.extras?.rotaryRole === 'jaw'),
    ).toHaveLength(4);
    expect(
        model.nodes.find((n) => n.extras?.rotaryRole === 'tailstock').children,
    ).toHaveLength(24);
    expect(model.nodes[0].extras.jawProjection).toBeCloseTo(15.8, 3);
});
test.each([
    { length: 90, diameter: 25.4 },
    { length: 300, diameter: 80 },
])('CAD contact faces follow stock dimensions: %j', (stock) => {
    const root = machine();
    poseMachine(root, stock, defaultAlignment);
    root.traverse((object) => {
        if (object.userData.rotaryRole === 'tailstock') {
            const p = vertices(
                model.nodes.find((n) => n.name === 'Live Center Point'),
            );
            let minX = Infinity;
            for (let i = 0; i < p.length; i += 3)
                minX = Math.min(
                    minX,
                    new THREE.Vector3(p[i], p[i + 1], p[i + 2]).applyMatrix4(
                        object.matrixWorld,
                    ).x,
                );
            expect(minX).toBeCloseTo(stock.length, 3);
        }
        if (object.userData.rotaryRole === 'jaw') {
            const p = vertices(
                model.nodes.find((n) => n.extras === object.userData),
            );
            const direction = new THREE.Vector3().fromArray(
                object.userData.radialDirection,
            );
            let contact = Infinity,
                projection = -Infinity;
            for (let i = 0; i < p.length; i += 3) {
                if (p[i] <= 0) continue;
                const point = new THREE.Vector3(
                    p[i],
                    p[i + 1],
                    p[i + 2],
                ).applyMatrix4(object.matrixWorld);
                contact = Math.min(contact, point.dot(direction));
                projection = Math.max(projection, point.x);
            }
            expect(contact).toBeCloseTo(stock.diameter / 2, 3);
            expect(projection).toBeCloseTo(15.8, 3);
        }
    });
});
test('calibration remains absolute across repeated updates', () => {
    const root = machine(),
        stock = { length: 120, diameter: 40 };
    const settings = {
        ...defaultAlignment,
        x: 10,
        rz: 90,
        jawProjection: 20,
        tailOffset: 5,
    };
    poseMachine(root, stock, settings);
    const first = root.toJSON();
    poseMachine(root, stock, settings);
    expect(root.toJSON()).toEqual(first);
    const tail = root.getObjectByName('Tailstock Assembly <1>');
    expect(tail.position.x * 1000 + tail.userData.tipX).toBeCloseTo(125);
    expect(root.getObjectByName('Internal Jaw').position.x * 1000).toBeCloseTo(
        4.2,
    );
});
test('stored calibration rejects malformed and non-finite values', () => {
    expect(readAlignment('broken')).toEqual(defaultAlignment);
    expect(readAlignment('{"x":12,"y":"99","rz":1e999,"z":20000}')).toEqual({
        ...defaultAlignment,
        x: 12,
    });
});

test('machine animation eases stock and calibration together and finishes exactly', () => {
    const from = {
        length: 90,
        diameter: 20,
        alignment: { ...defaultAlignment },
    };
    const to = {
        length: 120,
        diameter: 60,
        alignment: { ...defaultAlignment, x: 10, rz: 90, tailOffset: 4 },
    };
    expect(interpolateMachinePose(from, to, 0)).toEqual(from);
    const halfway = interpolateMachinePose(from, to, 225);
    expect(halfway.length).toBe(105);
    expect(halfway.diameter).toBe(40);
    expect(halfway.alignment.x).toBe(5);
    expect(halfway.alignment.rz).toBe(45);
    expect(halfway.alignment.tailOffset).toBe(2);
    expect(interpolateMachinePose(from, to, 450)).toBe(to);
    expect(interpolateMachinePose(from, to, 1000)).toBe(to);
    // A new target starts from the current visible position, without a jump.
    expect(interpolateMachinePose(halfway, from, 0)).toEqual(halfway);
    expect(interpolateMachinePose(from, to, 45).length).toBeLessThan(93);
});
