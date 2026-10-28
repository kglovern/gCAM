import { planProfilePaths } from './profilePaths';
import { protectSupports, supportZones } from './supports';
import {
    profileChuckMinX,
    profileTailMaxX,
    profileFixtureConflict,
} from './fixtureClearance';
/** Profile facing, groove and part-off moves, with shared native rotary roughing/finishing. */
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
    onProgress: (fraction: number) => void = () => {},
): ToolpathMove[] {
    const supports = supportZones(
        stock,
        samples[0].x,
        samples[samples.length - 1].x,
    );
    if (supports.length && ops.part.on)
        throw new Error(
            'Part-off is blocked while stock supports are enabled. Remove supports manually after machining.',
        );
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
    const chuckMinX = profileChuckMinX(stock, tool, ops);
    if (
        profileFixtureConflict(
            S,
            stock,
            ops,
            chuckMinX,
            profileTailMaxX(stock, tool, ops),
        )
    )
        return [];
    const x1 = Math.min(stock.length, S[S.length - 1].x);
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

    if (ops.face) {
        const zf = Math.max(0.2, prof(x1));
        retract('face');
        gotoXA(x1, aCur, 'face');
        plungeZ(x1, aCur, zf, 'face');
        spinOnce(x1, zf, cutF, 'face');
        retract('face');
    }

    if (ops.rough)
        for (const move of planProfilePaths(
            samples,
            stock,
            tool,
            ops,
            'rough',
            onProgress,
        ))
            moves.push(move);
    if (ops.finish)
        for (const move of planProfilePaths(
            samples,
            stock,
            tool,
            ops,
            'finish',
            onProgress,
        ))
            moves.push(move);

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
    return protectSupports(moves, supports, tool, ops.mesh);
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
