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

const stock: RotaryStock = { length: 86, diameter: 37, grip: 19, ext: false };
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
        const dz = Math.abs(z - pz);
        const da = Math.abs(a - pa);
        // No diagonal feed at fixed angle (chord would gouge convex slopes).
        if (!m.rapid && da < 1e-9 && dx > 0.05 && dz > 0.05) {
            throw new Error(
                `${label} chord feed dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}`,
            );
        }
        if (!m.rapid) {
            expect(da).toBeLessThanOrEqual(90 + 1e-9);
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
            expect(z).toBeGreaterThanOrEqual(refAt(ref, x) - 0.01);
        }
        px = x;
        pz = z;
        pa = a;
    }
    expect(Math.abs(pa)).toBeLessThanOrEqual(360 + 1e-6);
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
        const ref = compR > 0 ? offsetEnvelope(smp, compR) : smp;
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
