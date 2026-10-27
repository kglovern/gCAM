import fs from 'node:fs';
import { parseSTL, bakeForViewer } from './stl';
import {
    rotateAboutX,
    toolInMaterial,
    rotarySurfaceMesh,
    validateRotaryMesh,
} from './meshCoordinates';
import {
    rasterizeTopSurface,
    cutterContactHeight,
} from '../../engine/surface-cam';
const file = fs.readFileSync('cypress/fixtures/rotary-asymmetric.stl');
const mesh = {
    ...bakeForViewer(parseSTL(file), 20),
    name: 'asymmetric',
    key: 'fixture',
};
test.each([0, 45, 90, 180, 270, 360, -45])(
    'A transform round trips at %s degrees',
    (angle) => {
        const p = { x: 23, y: 4, z: 7 };
        const result = toolInMaterial(rotateAboutX(p, angle), angle);
        expect(result.x).toBeCloseTo(p.x);
        expect(result.y).toBeCloseTo(p.y);
        expect(result.z).toBeCloseTo(p.z);
    },
);
test('positive A rotates machine Y toward machine Z', () => {
    expect(rotateAboutX({ x: 0, y: 1, z: 0 }, 90).z).toBeCloseTo(1);
});
test('shared XYZ cutter contact preserves distinct flat STL faces', () => {
    validateRotaryMesh(mesh);
    const height = (angle) => {
        const field = rasterizeTopSurface(rotarySurfaceMesh(mesh, angle), 0.25);
        return cutterContactHeight(field, 30, 0, 'flat', 2);
    };
    expect(height(0)).toBeCloseTo(8);
    expect(height(90)).toBeCloseTo(5);
    expect(height(180)).toBeCloseTo(6);
    expect(height(270)).toBeCloseTo(3);
});
test('open and non-finite meshes are rejected', () => {
    expect(() =>
        validateRotaryMesh({
            ...mesh,
            positions: mesh.positions.slice(9),
            triangles: 11,
        }),
    ).toThrow(/closed/);
    const invalid = mesh.positions.slice();
    invalid[0] = NaN;
    expect(() => validateRotaryMesh({ ...mesh, positions: invalid })).toThrow(
        /non-finite/,
    );
});

test('generated boss-and-pocket fixture is a closed 320-triangle mesh', () => {
    const bytes = fs.readFileSync('cypress/fixtures/rotary-faceted-pocket.stl');
    const model = {
        ...bakeForViewer(parseSTL(bytes), 60),
        name: 'pocket',
        key: 'pocket',
    };
    expect(model.triangles).toBe(320);
    expect(() => validateRotaryMesh(model)).not.toThrow();
});
