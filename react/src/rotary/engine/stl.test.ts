/** Tests: rotary STL import — parse, silhouette, viewer baking. */
import {
    bakeForViewer,
    fitPoints,
    meshBounds,
    parseSTL,
    silhouette,
} from './stl';

// 20 x 20 x 40 box, base at z=0: radial section is constant hypot(10,10).
function boxStl(): string {
    const v: Array<[number, number, number]> = [
        [-10, -10, 0],
        [10, -10, 0],
        [10, 10, 0],
        [-10, -10, 0],
        [10, 10, 0],
        [-10, 10, 0],
        [-10, -10, 40],
        [10, 10, 40],
        [10, -10, 40],
        [-10, -10, 40],
        [-10, 10, 40],
        [10, 10, 40],
    ];
    const quads: number[][] = [
        [
            -10, -10, 0, 10, -10, 0, -10, -10, 40, 10, -10, 0, 10, -10, 40, -10,
            -10, 40,
        ],
        [
            10, -10, 0, 10, 10, 0, 10, -10, 40, 10, 10, 0, 10, 10, 40, 10, -10,
            40,
        ],
        [
            10, 10, 0, -10, 10, 0, 10, 10, 40, -10, 10, 0, -10, 10, 40, 10, 10,
            40,
        ],
        [
            -10, 10, 0, -10, -10, 0, -10, 10, 40, -10, -10, 0, -10, -10, 40,
            -10, 10, 40,
        ],
    ];
    let s = 'solid box\n';
    const facet = (a: number[], b: number[], c: number[]): void => {
        s += '  facet normal 0 0 0\n    outer loop\n';
        for (const p of [a, b, c]) {
            s += `      vertex ${p[0]} ${p[1]} ${p[2]}\n`;
        }
        s += '    endloop\n  endfacet\n';
    };
    for (let i = 0; i < v.length; i += 3) {
        facet(v[i], v[i + 1], v[i + 2]);
    }
    for (const q of quads) {
        facet([q[0], q[1], q[2]], [q[3], q[4], q[5]], [q[6], q[7], q[8]]);
        facet(
            [q[9], q[10], q[11]],
            [q[12], q[13], q[14]],
            [q[15], q[16], q[17]],
        );
    }
    return `${s}endsolid box\n`;
}

function boxVerts(): Float32Array {
    const s = boxStl();
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i);
    }
    return parseSTL(bytes);
}

test('ASCII box parses with correct bounds', () => {
    const verts = boxVerts();
    expect(verts.length / 9).toBe(12);
    const { mn, mx } = meshBounds(verts);
    expect(mn.map((n) => Math.round(n))).toEqual([-10, -10, 0]);
    expect(mx.map((n) => Math.round(n))).toEqual([10, 10, 40]);
});

test('box silhouette is the constant corner radius', () => {
    const sil = silhouette(boxVerts(), 20, 1);
    expect(sil).toHaveLength(21);
    for (const p of sil) {
        expect(p.r).toBeCloseTo(Math.hypot(10, 10), 1);
    }
    expect(sil[sil.length - 1].x).toBeCloseTo(40, 6);
});

test('fitPoints decimates to smooth control points', () => {
    const pts = fitPoints(silhouette(boxVerts(), 40, 1), 8);
    expect(pts.length).toBeLessThanOrEqual(8);
    expect(pts[0].x).toBe(0);
    for (const p of pts) {
        expect(p.type).toBe('smooth');
    }
});

test('bakeForViewer maps base ring to shift and preserves radius', () => {
    const baked = bakeForViewer(boxVerts(), 20);
    expect(baked.triangles).toBe(12);
    let x0 = Infinity;
    let x1 = -Infinity;
    let rmax = 0;
    for (let i = 0; i < baked.positions.length; i += 3) {
        x0 = Math.min(x0, baked.positions[i]);
        x1 = Math.max(x1, baked.positions[i]);
        rmax = Math.max(
            rmax,
            Math.hypot(baked.positions[i + 1], baked.positions[i + 2]),
        );
    }
    expect(x0).toBeCloseTo(20, 6);
    expect(x1).toBeCloseTo(60, 6);
    expect(rmax).toBeCloseTo(Math.hypot(10, 10), 6);
});
