import { defaultFixtureSettings, fixtureXClearance } from './fixtureClearance';
/** Tests: rotary toolpath motion rules (no gouging, bounded A, keep-out). */
import { runChecks } from './checks';
import { sampleProfile, templateProfile } from './profileModel';
import { estimate, offsetEnvelope, planToolpath } from './toolpath';
import type {
    ProfileSample,
    RotaryOps,
    RotaryStock,
    RotaryTool,
    ToolpathMove,
} from './types';

const stock: RotaryStock = { length: 140, diameter: 37, grip: 19, ext: false };
const zSafe = stock.diameter / 2 + 5;
const tool: RotaryTool = {
    type: 'ball',
    dia: 6.35,
    spindle: 16000,
    feed: 1270,
    plunge: 381,
    slotNum: null,
};
const base: RotaryOps = {
    face: true,
    rough: true,
    allow: 0.8,
    roughStep: 2,
    finish: true,
    raster: 270,
    groove: { on: false, x: 55, w: 3 },
    part: { on: false, x: 80 },
    pommels: [],
    compR: 0,
};

test.each([false, true])(
    'machine capacity boundaries are inclusive (extended=%s)',
    (ext) => {
        const limit = ext ? 1003 : 546;
        const capacityErrors = (length: number, diameter: number) =>
            runChecks(
                queenSamples(),
                { ...stock, ext, length, diameter },
                tool,
                base,
            ).filter((check) => /exceeds.*(capacity|track)/.test(check.msg));
        expect(capacityErrors(limit, 101.6)).toEqual([]);
        expect(capacityErrors(limit + 0.1, 101.6)).toHaveLength(1);
        expect(capacityErrors(limit, 101.7)).toHaveLength(1);
    },
);

function queenSamples(): ProfileSample[] {
    const pts = templateProfile('queen');
    return sampleProfile(pts, 16);
}

function refAt(ref: ProfileSample[], x: number): number {
    if (x <= ref[0].x) {
        return ref[0].r;
    }
    for (let i = 0; i < ref.length - 1; i++) {
        const a = ref[i];
        const b = ref[i + 1];
        if (x >= a.x && x <= b.x) {
            const t = (x - a.x) / Math.max(1e-9, b.x - a.x);
            return a.r + (b.r - a.r) * t;
        }
    }
    return ref[ref.length - 1].r;
}

function checkMotion(
    mv: ToolpathMove[],
    ref: ProfileSample[],
    label: string,
): void {
    let px = 0;
    let pz = zSafe + 20;
    let pa = 0;
    for (const m of mv) {
        const x = m.x ?? px;
        const z = m.z ?? pz;
        const a = m.a ?? pa;
        const dx = Math.abs(x - px);
        const da = Math.abs(a - pa);
        if (!m.rapid) {
            if (da > 90 + 1e-9)
                throw new Error(`${label} oversized angular feed ${da}`);
        }
        // Long rapids only at safe height.
        if (m.rapid && z < zSafe - 0.01 && dx > 3) {
            throw new Error(`${label} low rapid dx=${dx} z=${z}`);
        }
        // Tooltip stays at/above the envelope (groove/part cut deliberately).
        if (
            !m.rapid &&
            (m.op === 'face' || m.op === 'rough' || m.op === 'finish')
        ) {
            if (z < refAt(ref, x) - 0.01)
                throw new Error(`${label} below profile at X${x}: ${z}`);
        }
        px = x;
        pz = z;
        pa = a;
    }
    expect(Number.isFinite(pa)).toBe(true);
}

test('offsetEnvelope is exact on flats and tangent on slopes', () => {
    const flat = offsetEnvelope(
        [
            { x: 0, r: 10 },
            { x: 20, r: 10 },
        ],
        3,
    );
    for (const p of flat.slice(0, 3)) {
        // Tooltip rides the surface on flats (center +R, tip -R).
        expect(p.r).toBeCloseTo(10, 2);
    }
    const cone = offsetEnvelope(
        [
            { x: 0, r: 10 },
            { x: 10, r: 5 },
        ],
        3,
    );
    const mid = cone[Math.floor(cone.length / 2)];
    // Slope -0.5 -> tip lift R/sqrt(1.25) - R above raw... below center line.
    expect(mid.r).toBeGreaterThan(10 - 5 * (mid.x / 10) - 0.5);
    expect(mid.r).toBeLessThan(10 - 5 * (mid.x / 10) + 3.2);
    expect(cone.every((p, i) => i === 0 || p.x >= cone[i - 1].x)).toBe(true);
});

test.each([
    [270, 0],
    [270, 3.175],
    [0, 0],
    [0, 3.175],
] as Array<[number, number]>)(
    'motion rules hold (raster %i, compR %s)',
    (raster, compR) => {
        const smp = queenSamples();
        const mv = planToolpath(smp, stock, tool, {
            ...base,
            raster,
            compR,
        });
        const ref = smp;
        checkMotion(mv, ref, `r${raster}/c${compR}`);
        expect(estimate(mv).moves).toBe(mv.length);
    },
);

test('pommel ranges exclude rough/finish tooltips', () => {
    const smp = queenSamples();
    const mv = planToolpath(smp, stock, tool, {
        ...base,
        pommels: [{ x0: 30, x1: 40, w: 20 }],
    });
    for (const m of mv) {
        if (
            !m.rapid &&
            (m.op === 'rough' || m.op === 'finish') &&
            m.x !== undefined
        ) {
            expect(m.x < 30.001 || m.x > 39.999).toBe(true);
        }
    }
});

test('checks flag pommel corner fit and groove overlap', () => {
    const smp = queenSamples();
    const okFlags = runChecks(smp, stock, tool, {
        ...base,
        pommels: [{ x0: 30, x1: 40, w: 20 }],
    });
    expect(okFlags.some((f) => f.level === 'e')).toBe(false);
    const bad = runChecks(smp, stock, tool, {
        ...base,
        pommels: [{ x0: 30, x1: 40, w: 40 }],
    });
    expect(bad.some((f) => f.level === 'e' && /corners/.test(f.msg))).toBe(
        true,
    );
    const gp = runChecks(smp, stock, tool, {
        ...base,
        groove: { on: true, x: 35, w: 3 },
        pommels: [{ x0: 30, x1: 40, w: 20 }],
    });
    expect(gp.some((f) => f.level === 'w' && /Groove/.test(f.msg))).toBe(true);
});

test.each([0, 270])(
    'profile operations keep cutters clear of the chuck (raster %i)',
    (raster) => {
        for (const diameter of [2, 6.35, 16]) {
            const cutter = { ...tool, dia: diameter };
            const minX = stock.grip + diameter / 2 + 5 + 0.5;
            const ops = {
                ...base,
                raster,
                groove: { on: true, x: 55, w: 20 },
                part: { on: true, x: 80 },
            };
            const moves = planToolpath(queenSamples(), stock, cutter, ops);
            expect(moves.length).toBeGreaterThan(0);
            for (const move of moves)
                if (move.x !== undefined)
                    expect(move.x).toBeGreaterThanOrEqual(minX - 1e-9);
        }
    },
);

test.each(['groove', 'part', 'face'] as const)(
    'unsafe %s cuts are blocked at both planning and export checks',
    (operation) => {
        const samples =
            operation === 'face'
                ? [
                      { x: 19, r: 10 },
                      { x: 22, r: 10 },
                  ]
                : queenSamples();
        const ops = {
            ...base,
            face: operation === 'face',
            rough: false,
            finish: false,
            groove: { on: operation === 'groove', x: 29, w: 6.35 },
            part: { on: operation === 'part', x: 23 },
        };
        expect(planToolpath(samples, stock, tool, ops)).toEqual([]);
        expect(
            runChecks(samples, stock, tool, ops).some(
                (f) => f.level === 'e' && /chuck clearance/.test(f.msg),
            ),
        ).toBe(true);
    },
);

test('fixture margin includes configured shank and holder widths', () => {
    expect(
        fixtureXClearance(tool, {
            ...defaultFixtureSettings,
            shankDiameter: 12,
        }),
    ).toBe(11.5);
    expect(
        fixtureXClearance(tool, {
            ...defaultFixtureSettings,
            holderDiameter: 24,
        }),
    ).toBe(17.5);
});
