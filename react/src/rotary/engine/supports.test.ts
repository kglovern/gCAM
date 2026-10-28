import {
    defaultSupports,
    protectSupports,
    supportContact,
    supportZones,
} from './supports';
import { planProfilePaths } from './profilePaths';
import { planToolpath } from './toolpath';
import { defaultMeshSettings } from './meshToolpath';
import type { RotaryOps, RotaryStock, RotaryTool, ToolpathMove } from './types';

const stock: RotaryStock = {
    length: 90,
    diameter: 20,
    grip: 19,
    ext: false,
    supports: {
        ...defaultSupports,
        endDiameter: 12,
        chuckOverlap: 3,
        tailOverlap: 3,
    },
};
const samples = [
    { x: 30, r: 2 },
    { x: 50, r: 1 },
];
const tool: RotaryTool = {
    type: 'ball',
    dia: 2,
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
    groove: { on: false, x: 40, w: 3 },
    part: { on: false, x: 49 },
    pommels: [],
    compR: 0,
    mesh: {
        ...defaultMeshSettings,
        strategy: 'around',
        tolerance: 0.5,
        stepover: 1,
    },
};

test('supports connect to both stock ends and reject invalid settings', () => {
    expect(supportZones(stock, 30, 50)).toEqual([
        { x0: 0, x1: 90, radius: 3 },
        { x0: 0, x1: 33, radius: 6 },
        { x0: 47, x1: 90, radius: 6 },
    ]);
    expect(supportZones({ ...stock, supports: undefined }, 30, 50)).toEqual([]);
    for (const patch of [
        { coreDiameter: 0 },
        { endDiameter: 21 },
        { chuckOverlap: NaN },
        { tailOverlap: 30 },
    ])
        expect(() =>
            supportZones(
                { ...stock, supports: { ...stock.supports!, ...patch } },
                30,
                50,
            ),
        ).toThrow(/support/);
});

test('cutter contact includes finite support end faces and lateral reach', () => {
    const zones = [{ x0: 40, x1: 60, radius: 6 }];
    expect(supportContact(zones, 50, 0, 2, true)).toBeCloseTo(6);
    expect(supportContact(zones, 50, 7, 2, false)).toBeCloseTo(Math.sqrt(11));
    expect(supportContact(zones, 39, 0, 2, true)).toBeCloseTo(4 + Math.sqrt(3));
    expect(supportContact(zones, 37, 0, 2, true)).toBe(-Infinity);
});

test('invalid tool assemblies block support planning; raised paths keep plunge limits', () => {
    const zones = supportZones(stock, 30, 50);
    const moves: ToolpathMove[] = [
        { x: 40, y: 0, z: 15, a: 0, rapid: true, op: 'finish' },
        { x: 41, y: 0, z: 0, a: 0, f: 500, minutes: 0.001, op: 'finish' },
    ];
    expect(() =>
        protectSupports(moves, zones, tool, {
            holderDiameter: NaN,
            shankDiameter: 0,
        }),
    ).toThrow(/assembly/);
    const result = protectSupports(moves, zones, tool);
    expect(result[1].minutes! * tool.plunge).toBeGreaterThanOrEqual(
        result[0].z! - result[1].z!,
    );
});

test.each(['flat', 'ball'] as const)(
    'protects entire diagonal segments with a %s cutter and retimes changed blocks',
    (type) => {
        const zones = [{ x0: 40, x1: 60, radius: 6 }];
        const moves: ToolpathMove[] = [
            { x: 30, y: -10, z: 0, a: 0, rapid: true, op: 'finish' },
            {
                x: 70,
                y: 10,
                z: 0,
                a: 360,
                minutes: 0.001,
                f: 500,
                op: 'finish',
            },
        ];
        const result = protectSupports(moves, zones, { ...tool, type });
        expect(moves[0].z).toBe(0);
        expect(result[1].minutes).toBeGreaterThan(0.001);
        for (let i = 0; i <= 100; i++) {
            const t = i / 100,
                x = 30 + 40 * t,
                y = -10 + 20 * t;
            const z = result[0].z! * (1 - t) + result[1].z! * t;
            if (type === 'ball') {
                const dx = Math.max(40 - x, 0, x - 60);
                const radialGap = Math.max(0, Math.hypot(y, z + 1) - 6);
                expect(Math.hypot(dx, radialGap)).toBeGreaterThanOrEqual(1);
            } else {
                for (let a = 0; a < 360; a += 15) {
                    const px = x + Math.cos((a * Math.PI) / 180),
                        py = y + Math.sin((a * Math.PI) / 180);
                    if (px >= 40 && px <= 60 && Math.abs(py) < 6)
                        expect(z).toBeGreaterThanOrEqual(
                            Math.sqrt(36 - py * py),
                        );
                }
            }
        }
    },
);

test.each(['rough', 'finish'] as const)(
    'profile %s, facing and grooves leave the core and end stubs; part-off is blocked',
    (operation) => {
        const moves = planProfilePaths(samples, stock, tool, ops, operation);
        expect(moves.length).toBeGreaterThan(0);
        for (const move of moves) {
            expect(move.z).toBeGreaterThanOrEqual(3);
            if (move.x! <= 33 || move.x! >= 47)
                expect(move.z).toBeGreaterThanOrEqual(6);
        }
        const special = planToolpath(samples, stock, tool, {
            ...ops,
            finish: false,
            face: true,
            groove: { on: true, x: 40, w: 3 },
        });
        expect(
            special
                .filter((move) => move.op === 'face' && !move.rapid)
                .every((move) => move.z! >= 6),
        ).toBe(true);
        expect(
            special
                .filter((move) => move.op === 'groove' && !move.rapid)
                .every((move) => move.z! >= 3),
        ).toBe(true);
        expect(() =>
            planToolpath(samples, stock, tool, {
                ...ops,
                part: { on: true, x: 49 },
            }),
        ).toThrow(/Part-off is blocked/);
    },
);
