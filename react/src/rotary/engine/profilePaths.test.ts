import { combineRotaryPaths } from './job';
import {
    createProfileContact,
    planProfilePaths,
    profileMachiningSettings,
} from './profilePaths';
import { defaultMeshSettings } from './meshToolpath';
import { toGcode } from './gcode';
import type { RotaryOps, RotaryTool } from './types';
const samples = [
    { x: 30, r: 5 },
    { x: 40, r: 5 },
    { x: 40, r: 10 },
    { x: 50, r: 10 },
];
const stock = { length: 140, diameter: 24, grip: 19, ext: false };
const tool: RotaryTool = {
    type: 'ball',
    dia: 4,
    feed: 500,
    plunge: 100,
    spindle: 16000,
    slotNum: 1,
};
const ops: RotaryOps = {
    face: false,
    rough: false,
    finish: true,
    allow: 0.5,
    roughStep: 2,
    raster: 0,
    groove: { on: false, x: 55, w: 4 },
    part: { on: false, x: 80 },
    pommels: [],
    compR: 0,
};

test('legacy Along X and Around A choices migrate to native rotary patterns', () => {
    expect(profileMachiningSettings(ops, tool, false).strategy).toBe('along');
    expect(
        profileMachiningSettings({ ...ops, raster: 270 }, tool, false).strategy,
    ).toBe('around');
});

test('flat and ball contacts enclose independently sampled slopes and vertical shoulders', () => {
    const profile = [
        { x: 0, r: 8 },
        { x: 5, r: 2 },
        { x: 5, r: 12 },
        { x: 10, r: 4 },
    ];
    const contact = createProfileContact(profile);
    for (const ball of [false, true])
        for (let x = 0; x <= 10; x += 0.25) {
            let oracle = -Infinity;
            for (let i = 1; i < profile.length; i++)
                for (let k = 0; k <= 500; k++) {
                    const p = profile[i - 1],
                        q = profile[i],
                        t = k / 500,
                        u = p.x + (q.x - p.x) * t,
                        r = p.r + (q.r - p.r) * t;
                    const h2 = 4 - (u - x) ** 2;
                    if (h2 >= 0)
                        oracle = Math.max(
                            oracle,
                            r + (ball ? Math.sqrt(h2) : 0),
                        );
                }
            expect(contact(x, 2, ball)).toBeGreaterThanOrEqual(oracle - 1e-7);
            expect(contact(x, 2, ball) - oracle).toBeLessThan(0.1);
        }
});

for (const type of ['flat', 'ball'] as const)
    for (const strategy of ['around', 'along', 'helix'] as const) {
        test(`${type} ${strategy} finishes continuously with protected command interiors and G93 timing`, () => {
            const cutter = { ...tool, type };
            const settings = {
                ...defaultMeshSettings,
                strategy,
                stepover: 1,
                tolerance: 0.5,
            };
            const moves = planProfilePaths(
                samples,
                stock,
                cutter,
                { ...ops, mesh: settings },
                'finish',
            );
            expect(moves.length).toBeGreaterThan(100);
            expect(
                moves
                    .filter((m) => !m.rapid)
                    .every((m) => m.minutes! > 0 && m.y === 0),
            ).toBe(true);
            expect(
                moves.some(
                    (m, i) =>
                        i > 0 &&
                        !m.rapid &&
                        !moves[i - 1].rapid &&
                        (strategy === 'around'
                            ? m.a !== moves[i - 1].a && m.x === moves[i - 1].x
                            : strategy === 'along'
                              ? m.a === moves[i - 1].a && m.x !== moves[i - 1].x
                              : m.a !== moves[i - 1].a &&
                                m.x !== moves[i - 1].x),
                ),
            ).toBe(true);
            let clearance = Infinity;
            for (let i = 1; i < moves.length; i++) {
                const p = moves[i - 1],
                    q = moves[i];
                if (p.rapid || q.rapid) continue;
                for (const t of [0, 0.5, 1]) {
                    const x = p.x! + (q.x! - p.x!) * t,
                        z = p.z! + (q.z! - p.z!) * t;
                    let required = 5;
                    if (type === 'flat' && x + 2 >= 40) required = 10;
                    else if (type === 'ball' && x >= 40) required = 10;
                    else if (type === 'ball' && x >= 38)
                        required = Math.max(
                            5,
                            10 + Math.sqrt(Math.max(0, 4 - (x - 40) ** 2)) - 2,
                        );
                    clearance = Math.min(clearance, z - required);
                }
            }
            expect(clearance).toBeGreaterThanOrEqual(-1e-6);
            const code = toGcode(moves, {
                stock,
                tool: cutter,
                name: 'profile',
                mode: 'profile',
                compR: 0,
            });
            expect(code).toContain('G93');
            expect(code).toContain('G94');
            expect(code).not.toContain('G0X0.000A0.000');
            expect(
                code
                    .split(/\r?\n/)
                    .filter((l) => /^G1[XYZA]/.test(l))
                    .every((l) => /F[\d.]+$/.test(l)),
            ).toBe(true);
        });
    }

test('profile roughing has successive stepdown layers, allowance and pommel clearance', () => {
    const moves = planProfilePaths(
        samples,
        stock,
        tool,
        {
            ...ops,
            pommels: [{ x0: 39, x1: 43, w: 12 }],
            mesh: { ...defaultMeshSettings, stepover: 1 },
        },
        'rough',
    );
    const starts = moves.filter((m, i) => !m.rapid && moves[i - 1]?.rapid);
    expect(starts.length).toBeGreaterThan(2);
    expect(starts[0].z).toBeGreaterThanOrEqual(
        stock.diameter / 2 - ops.roughStep,
    );
    for (const m of moves)
        if (!m.rapid) expect(m.x! < 37 || m.x! > 45).toBe(true);
});

test('unsupported taper geometry is not silently treated as a straight ball cutter', () => {
    expect(() =>
        planProfilePaths(
            samples,
            stock,
            { ...tool, type: 'taper' },
            ops,
            'finish',
        ),
    ).toThrow(/straight ball/);
});

test('profile paths keep both fixtures clear and reject an oversized stepover', () => {
    expect(() =>
        planProfilePaths(
            samples,
            { ...stock, length: 55 },
            tool,
            ops,
            'finish',
        ),
    ).toThrow(/tailstock clearance/);
    expect(() =>
        planProfilePaths(
            samples,
            stock,
            tool,
            { ...ops, mesh: { ...defaultMeshSettings, stepover: 3 } },
            'finish',
        ),
    ).toThrow(/Stepover/);
});
test('the post keeps configured safe clearance at tool changes and the end', () => {
    const moves = planProfilePaths(samples, stock, tool, ops, 'finish');
    const code = toGcode(moves, {
        stock,
        tool,
        name: 'safe',
        mode: 'profile',
        compR: 0,
        clearance: 40,
    });
    expect(code).toContain('G0Z52.000');
    expect(code).not.toContain('G0Z17.000');
});

test('job operations preserve equivalent angles without a multi-turn unwind, and standalone paths normalize', () => {
    const entry = { id: 'one', operation: 'finish' as const, tool, ops };
    const first = {
        entry,
        compR: 0,
        flags: [],
        moves: [
            { x: 30, z: 20, a: 0, rapid: true, op: 'finish' },
            { x: 30, z: 10, a: 7200, op: 'finish', minutes: 1 },
        ],
    };
    const second = {
        ...first,
        entry: { ...entry, id: 'two' },
        moves: [
            { x: 30, z: 20, a: 0, rapid: true, op: 'finish' },
            { x: 30, z: 10, a: 360, op: 'finish', minutes: 1 },
        ],
    };
    const job = combineRotaryPaths([first, second]);
    expect(job.paths[1].moves.map((m) => m.a)).toEqual([7200, 7560]);
    expect(second.moves.map((m) => m.a)).toEqual([0, 360]);
    expect(combineRotaryPaths([job.paths[1]]).moves.map((m) => m.a)).toEqual([
        0, 360,
    ]);
});
