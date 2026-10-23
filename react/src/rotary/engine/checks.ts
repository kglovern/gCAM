import { profileChuckMinX, profileChuckConflict } from './fixtureClearance';
/**
 * Purpose: Machinability checks for Vortex rotary work (stock limits, chuck
 * and tailstock rules, tool fit, pommel keep-out). Ported from VortexCAM.
 */
import type {
    ProfileSample,
    RotaryCheck,
    RotaryOps,
    RotaryStock,
    RotaryTool,
} from './types';

export function runChecks(
    samples: ProfileSample[],
    stock: RotaryStock,
    tool: RotaryTool,
    ops: RotaryOps,
): RotaryCheck[] {
    const out: RotaryCheck[] = [];
    const stockR = stock.diameter / 2;
    const maxLen = stock.ext ? 1003 : 546;
    if (stock.diameter > 101.6) {
        out.push({
            level: 'e',
            msg: `Stock Ø ${stock.diameter}mm exceeds Vortex 4" (101.6mm) capacity.`,
        });
    }
    if (stock.length > maxLen) {
        out.push({
            level: 'e',
            msg: `Stock ${stock.length}mm exceeds ${stock.ext ? 'extension' : 'standard'} track (${maxLen}mm).`,
        });
    }
    if (stock.grip < 19) {
        out.push({
            level: 'w',
            msg: `Grip ${stock.grip}mm < 19mm minimum in chuck jaws — risk of pull-out.`,
        });
    }
    const maxR = Math.max(...samples.map((s) => s.r));
    if (maxR > stockR + 1e-6) {
        out.push({
            level: 'e',
            msg: `Profile Ø ${(maxR * 2).toFixed(1)} exceeds stock Ø ${stock.diameter} — increase stock or shrink profile.`,
        });
    }
    const minR = Math.min(...samples.map((s) => s.r));
    if (minR < 0.75) {
        out.push({
            level: 'w',
            msg: `Min radius ${minR.toFixed(2)}mm is a near-sharp tip — ballnose will leave flats; expect hand-sanding.`,
        });
    }
    const inGrip = samples.filter((s) => s.x < stock.grip);
    if (inGrip.some((s) => s.r > stockR - 0.5) && (ops.rough || ops.finish)) {
        out.push({
            level: 'w',
            msg: `Profile inside grip zone (X < ${stock.grip}mm) will hit chuck jaws — start profile past grip.`,
        });
    }
    if (stock.length - stock.grip > stock.diameter * 3) {
        out.push({
            level: 'w',
            msg: `Exposed length ${(stock.length - stock.grip).toFixed(0)}mm > 3× Ø — use the tailstock (handbook rule).`,
        });
    }
    if (ops.groove.on && ops.groove.w < tool.dia) {
        out.push({
            level: 'e',
            msg: `Groove width ${ops.groove.w}mm < tool Ø ${tool.dia}mm — widen groove or use smaller bit.`,
        });
    }
    if (ops.part.on && ops.part.x > stock.length - 1) {
        out.push({ level: 'e', msg: 'Part-off X beyond stock end.' });
    }
    const chuckMinX = profileChuckMinX(stock, tool, ops);
    const chuckConflict = profileChuckConflict(samples, stock, ops, chuckMinX);
    if (chuckConflict) out.push({ level: 'e', msg: chuckConflict });
    const inPom = (x: number): boolean =>
        (ops.pommels || []).some(
            (p) => x >= Math.min(p.x0, p.x1) && x <= Math.max(p.x0, p.x1),
        );
    for (const pm of ops.pommels || []) {
        const a = Math.min(pm.x0, pm.x1);
        const b = Math.max(pm.x0, pm.x1);
        if (a < 0 || b > stock.length) {
            out.push({
                level: 'e',
                msg: `Pommel X ${a.toFixed(0)}–${b.toFixed(0)} outside stock 0–${stock.length}.`,
            });
        }
        if (pm.w * Math.SQRT2 > stock.diameter + 1e-6) {
            out.push({
                level: 'e',
                msg: `Pommel □${pm.w} needs Ø ${(pm.w * Math.SQRT2).toFixed(1)} stock for the corners (have Ø ${stock.diameter}).`,
            });
        }
    }
    if (ops.groove.on && inPom(ops.groove.x)) {
        out.push({
            level: 'w',
            msg: `Groove at X=${ops.groove.x} sits inside a square pommel — interrupted cut, uneven floor.`,
        });
    }
    if (ops.part.on && inPom(ops.part.x)) {
        out.push({
            level: 'w',
            msg: `Part-off at X=${ops.part.x} sits inside a square pommel — interrupted cut, rough nub.`,
        });
    }
    if (ops.face && inPom(samples[samples.length - 1].x)) {
        out.push({
            level: 'w',
            msg: 'Profile end inside a square pommel — facing hammers the corners (interrupted cut).',
        });
    }
    // Valleys narrower than the tool bridge instead of cutting.
    for (let i = 2; i < samples.length - 2; i++) {
        const b = samples[i];
        if (b.r < samples[i - 2].r && b.r < samples[i + 2].r) {
            const level = b.r + tool.dia / 2;
            let l = i;
            let rgt = i;
            while (l > 0 && samples[l].r < level) {
                l--;
            }
            while (rgt < samples.length - 1 && samples[rgt].r < level) {
                rgt++;
            }
            if (samples[rgt].x - samples[l].x < tool.dia) {
                out.push({
                    level: 'w',
                    msg: `Narrow valley near X=${b.x.toFixed(1)} (width ${(samples[rgt].x - samples[l].x).toFixed(1)}mm < tool Ø ${tool.dia}mm) — finish will bridge it.`,
                });
                break;
            }
        }
    }
    if (!out.length) {
        out.push({
            level: 'o',
            msg: 'No issues. Zero X clear of chuck, probe Z on chuck, Rotary mode ON.',
        });
    }
    return out;
}
