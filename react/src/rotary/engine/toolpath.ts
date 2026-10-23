/**
 * Purpose: Rotary toolpath planner in XZA (Vortex convention, grblHAL).
 * Profile mode cuts the drawn envelope at tooltip Z = r; STL mode cuts the
 * ballnose-tooltip envelope (exact on flats, tangent on slopes). A
 * oscillates within one turn — it never winds up. Ported from VortexCAM.
 */
import type {
    ProfileSample,
    RotaryOps,
    RotaryStock,
    RotaryTool,
    ToolpathMove,
} from './types';

/** Ballnose tooltip envelope on uniform X stations (conservative at folds). */
export function offsetEnvelope(
    samples: ProfileSample[],
    toolRadius: number,
    stations = 400,
): ProfileSample[] {
    const x0 = samples[0].x;
    const x1 = samples[samples.length - 1].x;
    const bins = new Array<number>(stations + 1).fill(-Infinity);
    for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        const dx = b.x - a.x;
        const dr = b.r - a.r;
        const L = Math.hypot(dx, dr) || 1e-9;
        // Outward unit normal (away from material), scaled by R, minus R in Z
        // to convert the ball-center envelope to tooltip positions.
        const nx = (-dr / L) * toolRadius;
        const p = {
            x: a.x + nx,
            r: a.r + ((dx / L) * toolRadius - toolRadius),
        };
        const q = {
            x: b.x + nx,
            r: b.r + ((dx / L) * toolRadius - toolRadius),
        };
        const span = Math.abs(q.x - p.x);
        const steps = Math.max(1, Math.ceil(span / ((x1 - x0) / stations)));
        for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const x = p.x + (q.x - p.x) * t;
            const r = p.r + (q.r - p.r) * t;
            let bi = Math.round(((x - x0) / (x1 - x0)) * stations);
            if (bi < 0) {
                bi = 0;
            }
            if (bi > stations) {
                bi = stations;
            }
            if (r > bins[bi]) {
                bins[bi] = r;
            }
        }
    }
    for (let k = 0; k < 3; k++) {
        for (let s = 0; s <= stations; s++) {
            if (bins[s] === -Infinity) {
                bins[s] = Math.max(
                    s > 0 ? bins[s - 1] : -Infinity,
                    s < stations ? bins[s + 1] : -Infinity,
                );
            }
        }
    }
    const out: ProfileSample[] = [];
    for (let s = 0; s <= stations; s++) {
        out.push({
            x: x0 + ((x1 - x0) * s) / stations,
            r: Math.max(0.1, bins[s]),
        });
    }
    return out;
}

export function planToolpath(
    samples: ProfileSample[],
    stock: RotaryStock,
    tool: RotaryTool,
    ops: RotaryOps,
): ToolpathMove[] {
    const S = ops.compR > 0 ? offsetEnvelope(samples, ops.compR) : samples;
    const moves: ToolpathMove[] = [];
    const stockR = stock.diameter / 2;
    const zSafe = stockR + 5;
    const cutF = tool.feed;
    const plungeF = tool.plunge;
    const prof = (x: number): number => {
        if (x <= S[0].x) {
            return S[0].r;
        }
        for (let i = 0; i < S.length - 1; i++) {
            const a = S[i];
            const b = S[i + 1];
            if (x >= a.x && x <= b.x) {
                const t = (x - a.x) / Math.max(1e-6, b.x - a.x);
                return a.r + (b.r - a.r) * t;
            }
        }
        return S[S.length - 1].r;
    };
    const x0 = Math.max(stock.grip + 1, S[0].x);
    const x1 = Math.min(stock.length, S[S.length - 1].x);
    // Pommel keep-out: square sections are never cut.
    const zones = (ops.pommels || [])
        .map((p) => ({ a: Math.min(p.x0, p.x1), b: Math.max(p.x0, p.x1) }))
        .filter((z) => z.b > x0 && z.a < x1)
        .sort((m, n) => m.a - n.a);
    const inZone = (x: number): boolean =>
        zones.some((z) => x >= z.a - 1e-9 && x <= z.b + 1e-9);
    const freeSegs = ((): Array<[number, number]> => {
        const cuts = [x0, x1];
        for (const z of zones) {
            if (z.a > x0 && z.a < x1) {
                cuts.push(z.a);
            }
            if (z.b > x0 && z.b < x1) {
                cuts.push(z.b);
            }
        }
        cuts.sort((a, b) => a - b);
        const segs: Array<[number, number]> = [];
        for (let i = 0; i < cuts.length - 1; i++) {
            if (!inZone((cuts[i] + cuts[i + 1]) / 2)) {
                segs.push([cuts[i], cuts[i + 1]]);
            }
        }
        return segs;
    })();

    let aCur = 0;
    let spinDir = 1;

    const retract = (op: string): void => {
        moves.push({ z: zSafe, rapid: true, op });
    };
    const gotoXA = (x: number, a: number, op: string): void => {
        moves.push({ x, a, rapid: true, op });
    };
    const plungeZ = (
        x: number,
        a: number,
        z: number,
        op: string,
        feed: number = plungeF,
    ): void => {
        moves.push({ x, z, a, f: feed, op });
    };

    /** One full turn in 90° steps, alternating direction every call. */
    function spinOnce(x: number, z: number, feed: number, op: string): void {
        const target = aCur + spinDir * 360;
        moves.push({ x, z, a: aCur, f: feed, op });
        for (let s = 1; s < 4; s++) {
            moves.push({ x, z, a: aCur + spinDir * s * 90, op });
        }
        moves.push({ x, z, a: target, op });
        aCur = target;
        spinDir *= -1;
    }

    /**
     * Zigzag helix from xa to xb: A oscillates within one turn of aCur
     * while X glides and Z follows zFn. stepsPerRev=12 for finish, 4 rough.
     */
    function helixRun(
        xa: number,
        xb: number,
        zFn: (x: number) => number,
        lead: number,
        op: string,
        feed: number,
        stepsPerRev = 12,
    ): void {
        const len = Math.abs(xb - xa);
        const nRev = Math.max(1, Math.round(len / lead));
        const up = aCur < 360 - 1e-9;
        const lo = up ? aCur : aCur - 360;
        const phase = up ? 0 : 1;
        const totalSteps = nRev * stepsPerRev;
        for (let k = 1; k <= totalSteps; k++) {
            const rev = Math.floor((k - 1) / stepsPerRev) + phase;
            const f = (((k - 1) % stepsPerRev) + 1) / stepsPerRev;
            const aOff = rev % 2 === 0 ? f * 360 : (1 - f) * 360;
            const x = xa + ((xb - xa) * k) / totalSteps;
            moves.push({
                x,
                z: Math.max(0.15, zFn(x)),
                a: lo + aOff,
                f: feed,
                op,
            });
        }
        aCur = lo + ((nRev + phase) % 2 === 1 ? 360 : 0);
    }

    if (ops.face) {
        const zf = Math.max(0.2, prof(x1));
        retract('face');
        gotoXA(x1, aCur, 'face');
        plungeZ(x1, aCur, zf, 'face');
        spinOnce(x1, zf, cutF, 'face');
    }

    if (ops.rough) {
        const minR = Math.min(...S.map((s) => s.r));
        const levels: number[] = [];
        for (
            let z = stockR - ops.roughStep;
            z > minR + ops.allow;
            z -= ops.roughStep
        ) {
            levels.push(z);
        }
        levels.push(minR + ops.allow);
        const stepX = Math.max(0.5, tool.dia * 0.6);
        const xs: number[] = [];
        for (let x = x0; x <= x1; x += stepX) {
            xs.push(x);
        }
        xs.push(x1);
        let dir = 1;
        for (const z of levels) {
            const order = dir > 0 ? xs : [...xs].reverse();
            let run: number[] = [];
            const flush = (): void => {
                if (!run.length) {
                    return;
                }
                retract('rough');
                gotoXA(run[0], aCur, 'rough');
                plungeZ(run[0], aCur, z, 'rough');
                helixRun(
                    run[0],
                    run[run.length - 1],
                    () => z,
                    Math.max(1.0, tool.dia * 0.8),
                    'rough',
                    cutF,
                    4,
                );
                run = [];
            };
            for (const x of order) {
                if (!inZone(x) && prof(x) + ops.allow < z - 1e-6) {
                    run.push(x);
                } else {
                    flush();
                }
            }
            flush();
            dir *= -1;
        }
    }

    if (ops.finish) {
        if ((ops.raster ?? 270) === 0) {
            const aStart = aCur;
            for (let k = 0; k < 4; k++) {
                const Aq = aStart + (k + 1) * 90;
                const stepX = Math.max(0.3, tool.dia * 0.25);
                const xs: number[] = [];
                for (let x = x0; x <= x1; x += stepX) {
                    xs.push(x);
                }
                xs.push(x1);
                retract('finish');
                gotoXA(xs[0], Aq, 'finish');
                let zp = zSafe;
                for (const x of xs) {
                    if (inZone(x)) {
                        continue;
                    }
                    const z = Math.max(0.15, prof(x));
                    moves.push({
                        x,
                        z: Math.max(z, zp) + 1.0,
                        rapid: true,
                        op: 'finish',
                    });
                    plungeZ(x, Aq, z, 'finish');
                    zp = z;
                }
                aCur = Aq;
            }
            retract('finish');
            moves.push({ a: aStart, rapid: true, op: 'finish' });
            aCur = aStart;
        } else {
            const lead = Math.max(0.8, tool.dia * 0.5);
            for (const [sa, sb] of freeSegs) {
                if (sb - sa < 0.3) {
                    continue;
                }
                const zStart = Math.max(0.15, prof(sa));
                retract('finish');
                gotoXA(sa, aCur, 'finish');
                plungeZ(sa, aCur, zStart, 'finish');
                helixRun(sa, sb, (x) => prof(x), lead, 'finish', cutF, 12);
            }
        }
    }

    if (ops.groove.on) {
        const gx = ops.groove.x;
        const half = ops.groove.w / 2;
        const gz = Math.max(0.5, prof(gx) - 1.5);
        for (const x of [gx - half, gx, gx + half]) {
            retract('groove');
            gotoXA(x, aCur, 'groove');
            plungeZ(x, aCur, gz, 'groove');
            spinOnce(x, gz, cutF, 'groove');
        }
    }

    if (ops.part.on) {
        const px = Math.min(ops.part.x, stock.length - 1);
        retract('part');
        gotoXA(px, aCur, 'part');
        let z = prof(px);
        while (z > 1.0) {
            z = Math.max(1.0, z - Math.min(2, tool.dia * 0.5));
            plungeZ(px, aCur, z, 'part');
            spinOnce(px, z, cutF, 'part');
        }
    }
    return moves;
}

export interface ToolpathEstimate {
    moves: number;
    cutLen: number;
    totalLen: number;
    minutes: number;
}

export function estimate(
    moves: ToolpathMove[],
    rapidF = 2500,
): ToolpathEstimate {
    let dist = 0;
    let cut = 0;
    let prev: { x: number; y: number; z: number; a: number } | null = null;
    let time = 0;
    for (const m of moves) {
        const px: number = prev === null ? 0 : (m.x ?? prev.x);
        const py: number = prev === null ? 0 : (m.y ?? prev.y);
        const pz: number = prev === null ? 0 : (m.z ?? prev.z);
        const pa: number = prev === null ? 0 : (m.a ?? prev.a);
        if (prev) {
            const dx = (m.x ?? px) - px;
            const dy = (m.y ?? py) - py;
            const dz = (m.z ?? pz) - pz;
            const da =
                ((m.a ?? pa) - pa) * (Math.PI / 180) * Math.max(4, pz || 6);
            const d = Math.hypot(dx, dy, dz, da);
            dist += d;
            const f = m.rapid ? rapidF : m.f || 1000;
            time += !m.rapid && m.minutes ? m.minutes : d / f;
            if (!m.rapid) {
                cut += d;
            }
        }
        prev = { x: m.x ?? px, y: m.y ?? py, z: m.z ?? pz, a: m.a ?? pa };
    }
    return { moves: moves.length, cutLen: cut, totalLen: dist, minutes: time };
}
