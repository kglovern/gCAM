import fs from 'node:fs';
import { parseSTL, bakeForViewer } from './stl';
import {
    defaultMeshSettings,
    planMeshToolpath,
    blockMinutes,
} from './meshToolpath';
import { rotateAboutX } from './meshCoordinates';
import { toGcode } from './gcode';

const bytes = fs.readFileSync('cypress/fixtures/rotary-asymmetric.stl');
const mesh = { ...bakeForViewer(parseSTL(bytes), 60), name: 'box', key: 'box' };
const stock = { length: 140, diameter: 24, grip: 19, ext: false };
const tool = {
    type: 'flat',
    dia: 2,
    feed: 500,
    plunge: 150,
    spindle: 16000,
    slotNum: 1,
};
const settings = {
    ...defaultMeshSettings,
    independentAxis: true,
    cellSize: 0.5,
    stepover: 1,
    angleStep: 90,
    fluteLength: 16,
    shankDiameter: 3,
    stickout: 20,
    holderDiameter: 8,
};
const finish = (next = {}) =>
    planMeshToolpath(mesh, stock, tool, 'finish', 2, 0.5, {
        ...settings,
        ...next,
    });

test('indexed XYZ+A keeps asymmetric faces, moves Y, and retracts before indexing', () => {
    const moves = finish();
    for (const [a, height] of [
        [0, 8],
        [90, 5],
        [180, 6],
        [270, 3],
    ]) {
        const cut = moves.filter(
            (m) =>
                !m.rapid &&
                m.a === a &&
                Math.abs(m.y) < 0.1 &&
                m.x > 65 &&
                m.x < 85,
        );
        expect(cut.length).toBeGreaterThan(5);
        expect(cut[0].z).toBeCloseTo(height + 0.001, 4);
    }
    expect(new Set(moves.map((m) => m.y)).size).toBeGreaterThan(10);
    for (let i = 1; i < moves.length; i++)
        if (moves[i].a !== moves[i - 1].a) {
            expect(moves[i].rapid).toBe(true);
            expect(moves[i - 1].z).toBeGreaterThan(stock.diameter / 2);
        }
    for (const m of moves.filter((m) => !m.rapid))
        expect(m.minutes).toBeGreaterThan(0);
});

test('simultaneous finishing changes X/Y/A together and remains outside the box at interior samples', () => {
    const small = {
        ...mesh,
        positions: mesh.positions.map((v, i) =>
            i % 3 === 0 ? 60 + (v - 60) / 5 : v,
        ),
    };
    const moves = planMeshToolpath(small, stock, tool, 'finish', 2, 0.5, {
        ...settings,
        strategy: 'simultaneous',
        angleStep: 10,
    });
    expect(
        moves.some(
            (m, i) =>
                i &&
                !m.rapid &&
                m.x !== moves[i - 1].x &&
                m.y !== moves[i - 1].y &&
                m.a !== moves[i - 1].a,
        ),
    ).toBe(true);
    // Independent analytic ray/box surface oracle, evaluated between commands.
    for (let i = 1; i < moves.length; i++) {
        if (moves[i].rapid || moves[i - 1].rapid) continue;
        const a = moves[i - 1],
            b = moves[i];
        for (const t of [0.25, 0.5, 0.75]) {
            const x = a.x + (b.x - a.x) * t,
                y = a.y + (b.y - a.y) * t,
                z = a.z + (b.z - a.z) * t,
                angle = a.a + (b.a - a.a) * t;
            if (x < 61 || x > 65) continue;
            // Check each original box corner that can be under this flat cutter.
            for (const cy of [-3, 5])
                for (const cz of [-6, 8]) {
                    const corner = rotateAboutX({ x, y: cy, z: cz }, angle);
                    if (Math.abs(corner.y - y) <= tool.dia / 2)
                        expect(z).toBeGreaterThanOrEqual(corner.z - 1e-5);
                }
        }
    }
});

test('XYZA post emits Y and a positive G93 F on every feed, restores G94 and does not park over chuck', () => {
    const moves = finish();
    const code = toGcode(moves, {
        stock,
        tool,
        mode: 'stl',
        name: 'test',
        compR: 0,
    });
    expect(code).toContain('G93');
    expect(code).toContain('Y');
    expect(code).not.toContain('G0X0.000A0.000');
    for (const line of code.split(/\r?\n/).filter((l) => /^G1[XYZA]/.test(l)))
        expect(Number(line.match(/F([\d.]+)/)?.[1])).toBeGreaterThan(0);
    expect(code.slice(code.lastIndexOf('G94'))).toContain('M5');
});
test('mixed axis time bounds translation and rotary speed', () => {
    const a = { x: 0, y: 0, z: 10, a: 0 },
        b = { x: 10, y: 0, z: 10, a: 90 };
    expect(blockMinutes(a, b, 100, 60)).toBe(1.5);
});
test('unknown setup, incompatible tool, fixtures, invalid mesh and excessive jobs fail closed', () => {
    expect(() => finish({ independentAxis: false })).toThrow(/independent/);
    expect(() => finish({ fluteLength: 5 })).toThrow(/Tool geometry/);
    expect(() => finish({ cellSize: 0.001 })).toThrow(/cell size/);
    expect(() => finish({ strategy: 'simultaneous', angleStep: 0 })).toThrow();
    expect(() =>
        planMeshToolpath(mesh, stock, tool, 'rough', 2, 0.5, {
            ...settings,
            strategy: 'simultaneous',
        }),
    ).toThrow(/Rough with indexed/);
    expect(() =>
        planMeshToolpath(
            { ...mesh, positions: mesh.positions.slice(9), triangles: 11 },
            stock,
            tool,
            'finish',
            2,
            0,
            settings,
        ),
    ).toThrow(/closed/);
});

test('residual verification rejects a coarse simultaneous path instead of declaring it finished', () => {
    const tiny = {
        ...mesh,
        positions: mesh.positions.map((v, i) =>
            i % 3 === 0 ? 60 + (v - 60) / 5 : v,
        ),
    };
    expect(() =>
        planMeshToolpath(tiny, stock, tool, 'finish', 2, 0, {
            ...settings,
            strategy: 'simultaneous',
            angleStep: 90,
            tolerance: 0.000001,
        }),
    ).toThrow(/surface probes/);
});

test('enclosed internal cavity cannot be silently declared finished', () => {
    const inner = mesh.positions.map((v, i) =>
        i % 3 === 0 ? 75 + (v - 75) * 0.4 : 1 + (v - 1) * 0.4,
    );
    for (let i = 0; i < inner.length; i += 9)
        for (let k = 0; k < 3; k++)
            [inner[i + 3 + k], inner[i + 6 + k]] = [
                inner[i + 6 + k],
                inner[i + 3 + k],
            ];
    const positions = new Float32Array(mesh.positions.length + inner.length);
    positions.set(mesh.positions);
    positions.set(inner, mesh.positions.length);
    expect(() =>
        planMeshToolpath(
            { ...mesh, positions, triangles: 24 },
            stock,
            tool,
            'finish',
            2,
            0,
            settings,
        ),
    ).toThrow(/occluded|unresolved/);
});

test('model names cannot inject postprocessor commands through comments', () => {
    const code = toGcode(
        [
            { x: 60, y: 0, z: 20, a: 0, rapid: true, op: 'finish' },
            { x: 61, y: 0, z: 8, a: 0, f: 500, minutes: 0.1, op: 'finish' },
        ],
        { stock, tool, mode: 'stl', name: 'bad) G0Z-999 (\nM2', compR: 0 },
    );
    expect(code.split(/\r?\n/)[0]).not.toMatch(/\) G0/);
    expect(code.match(/^M2$/gm)).toHaveLength(1);
});

test('inverse-time surface speed includes stock contact radius, not just ball tip radius', () => {
    const a = { x: 60, y: 0, z: 1, a: 0 },
        b = { x: 60, y: 0, z: 1, a: 90 };
    const time = blockMinutes(a, b, 100, 100000, 10);
    expect(time).toBeGreaterThanOrEqual((10 * Math.PI) / 2 / 100);
});

test('feed timing uses the actual three-decimal posted coordinates', () => {
    const a = { x: 60.00049, y: 0, z: 10, a: 0.00049 },
        b = { x: 60.00051, y: 0, z: 10, a: 0.00051 };
    const expected = (0.001 + (10 * 0.001 * Math.PI) / 180) / 100;
    expect(blockMinutes(a, b, 100, 100000, 10)).toBeCloseTo(expected, 10);
});
