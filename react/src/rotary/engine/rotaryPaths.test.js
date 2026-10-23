/** @jest-environment node */
import fs from 'node:fs';
import { parseSTL, bakeForViewer } from './stl';
import { planMeshToolpath, defaultMeshSettings } from './meshToolpath';

const source = bakeForViewer(
    parseSTL(fs.readFileSync('cypress/fixtures/rotary-asymmetric.stl')),
    60,
);
const mesh = {
    ...source,
    positions: source.positions.map((v, i) =>
        i % 3 === 0 ? 60 + (v - 60) / 5 : v,
    ),
    name: 'asymmetric box',
    key: 'box',
};
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
    cellSize: 0.25,
    stepover: 1,
    tolerance: 0.25,
};
const finish = (strategy) =>
    planMeshToolpath(mesh, stock, tool, 'finish', 2, 0, {
        ...settings,
        strategy,
    });

function checkBox(moves) {
    // Independent cross-section oracle: intersect the rotated box edges with
    // the flat cutter's Y interval at interior X, including command interiors.
    for (let i = 1; i < moves.length; i++) {
        const p = moves[i - 1],
            q = moves[i];
        if (p.rapid || q.rapid) continue;
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const x = p.x + (q.x - p.x) * t,
                a = ((p.a + (q.a - p.a) * t) * Math.PI) / 180,
                z = p.z + (q.z - p.z) * t;
            if (x <= 61.2 || x >= 64.8) continue;
            const co = Math.cos(a),
                si = Math.sin(a);
            const corners = [
                [-3, -6],
                [5, -6],
                [5, 8],
                [-3, 8],
            ].map(([y, z]) => ({ y: y * co - z * si, z: y * si + z * co }));
            let top = -Infinity;
            for (let j = 0; j < 4; j++) {
                const u = corners[j],
                    v = corners[(j + 1) % 4];
                if (Math.abs(u.y) <= 1) top = Math.max(top, u.z);
                for (const y of [-1, 1]) {
                    const f = (y - u.y) / (v.y - u.y);
                    if (f >= 0 && f <= 1)
                        top = Math.max(top, u.z + f * (v.z - u.z));
                }
            }
            expect(z).toBeGreaterThanOrEqual(top - 1e-6);
        }
    }
}

test.each(['around', 'along', 'helix'])(
    '%s machines the actual facets and protects motion between commands',
    (strategy) => {
        const moves = finish(strategy);
        expect(moves.length).toBeGreaterThan(100);
        expect(moves.every((m) => m.y === 0)).toBe(true);
        expect(moves.filter((m) => !m.rapid).every((m) => m.minutes > 0)).toBe(
            true,
        );
        checkBox(moves);
        const feeds = moves.filter((m) => !m.rapid);
        if (strategy === 'around')
            expect(
                moves.filter((m, i) => !m.rapid && i && moves[i - 1].rapid)
                    .length,
            ).toBe(1);
        if (strategy === 'around')
            expect(
                feeds.some(
                    (m, i) =>
                        i > 0 &&
                        m.x === feeds[i - 1].x &&
                        m.a !== feeds[i - 1].a,
                ),
            ).toBe(true);
        if (strategy === 'along')
            expect(
                feeds.some(
                    (m, i) =>
                        i > 0 &&
                        m.a === feeds[i - 1].a &&
                        m.x !== feeds[i - 1].x,
                ),
            ).toBe(true);
        if (strategy === 'helix')
            expect(
                feeds.some(
                    (m, i) =>
                        i > 0 &&
                        m.x !== feeds[i - 1].x &&
                        m.a !== feeds[i - 1].a,
                ),
            ).toBe(true);
    },
);

test('rotary surface height can go below the centreline for offset geometry', () => {
    const offset = {
        ...mesh,
        positions: mesh.positions.map((v, i) => (i % 3 === 1 ? v - 14 : v)),
    };
    const moves = planMeshToolpath(
        offset,
        { ...stock, diameter: 46 },
        tool,
        'finish',
        2,
        0,
        settings,
    );
    expect(moves.some((m) => !m.rapid && m.a === 0 && m.z < 0)).toBe(true);
});

test('roughing uses depth layers and retracts clear of stock between rings', () => {
    const moves = planMeshToolpath(
        mesh,
        stock,
        tool,
        'rough',
        2,
        0.5,
        settings,
    );
    for (let i = 1; i < moves.length; i++) {
        const p = moves[i - 1],
            q = moves[i];
        if (q.rapid && (p.x !== q.x || p.a !== q.a))
            expect(p.z).toBeGreaterThan(stock.diameter / 2);
    }
    expect(moves.find((m) => !m.rapid).z).toBeGreaterThanOrEqual(10);
    expect(() =>
        planMeshToolpath(mesh, stock, tool, 'rough', 2, 0.5, {
            ...settings,
            strategy: 'helix',
        }),
    ).toThrow(/finishing strategy/);
});

test('centreline rotary roughing also supports a straight ball cutter', () => {
    const moves = planMeshToolpath(
        mesh,
        stock,
        { ...tool, type: 'ball' },
        'rough',
        2,
        0.5,
        settings,
    );
    expect(moves.length).toBeGreaterThan(100);
    expect(moves.every((m) => m.y === 0)).toBe(true);
    expect(moves.find((m) => !m.rapid).z).toBeGreaterThanOrEqual(10);
});

test('ball motion between angular commands clears independently sampled box surfaces', () => {
    const moves = planMeshToolpath(
        mesh,
        stock,
        { ...tool, type: 'ball' },
        'finish',
        2,
        0,
        { ...settings, strategy: 'helix' },
    );
    for (let i = 1; i < moves.length; i += 7) {
        const p = moves[i - 1],
            q = moves[i];
        if (p.rapid || q.rapid) continue;
        const x = (p.x + q.x) / 2,
            z = (p.z + q.z) / 2,
            a = (((p.a + q.a) / 2) * Math.PI) / 180;
        if (x <= 61.2 || x >= 64.8) continue;
        const corners = [
            [-3, -6],
            [5, -6],
            [5, 8],
            [-3, 8],
        ];
        for (let edge = 0; edge < 4; edge++)
            for (let k = 0; k <= 100; k++) {
                const u = corners[edge],
                    v = corners[(edge + 1) % 4],
                    t = k / 100;
                const sy = u[0] + (v[0] - u[0]) * t,
                    sz = u[1] + (v[1] - u[1]) * t;
                const y = sy * Math.cos(a) - sz * Math.sin(a),
                    height = sy * Math.sin(a) + sz * Math.cos(a);
                if (Math.abs(y) <= 1)
                    expect(z).toBeGreaterThanOrEqual(
                        height + Math.sqrt(1 - y * y) - 1 - 1e-6,
                    );
            }
    }
});

test('native planning reports work progress without changing geometry', () => {
    for (const strategy of ['around', 'along', 'helix']) {
        const progress = [];
        const moves = planMeshToolpath(
            mesh,
            stock,
            tool,
            'finish',
            2,
            0,
            { ...settings, strategy },
            undefined,
            undefined,
            (fraction) => progress.push(fraction),
        );
        expect(moves).toEqual(finish(strategy));
        expect(progress.some((n) => n > 0 && n < 0.95)).toBe(true);
        expect(progress.at(-1)).toBe(1);
        expect(
            progress.every(
                (n, i) => n >= 0 && n <= 1 && (!i || n >= progress[i - 1]),
            ),
        ).toBe(true);
    }
});
