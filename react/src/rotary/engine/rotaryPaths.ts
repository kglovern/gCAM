import { createRotaryContact } from './rotaryContact';
import { blockMinutes } from './meshToolpath';
import type {
    RotaryMeshSettings,
    RotaryStock,
    RotaryTool,
    StlMesh,
    ToolpathMove,
} from './types';

type Node = { x: number; y: number; z: number; a: number };

/** Centreline XZA machining against the original rotating triangles. Each
 * linear command is protected by an inflated cutter at its midpoint. */
export function planRotarySurface(
    mesh: StlMesh,
    stock: RotaryStock,
    tool: RotaryTool,
    operation: 'rough' | 'finish',
    stepdown: number,
    allowance: number,
    settings: RotaryMeshSettings,
    xmin: number,
    xmax: number,
    aborted: () => boolean,
    onProgress: (fraction: number) => void = () => {},
) {
    const radius = stock.diameter / 2,
        cutterRadius = tool.dia / 2;
    const budget =
            operation === 'rough'
                ? Math.max(
                      settings.tolerance / 4,
                      Math.min(stepdown / 4, cutterRadius / 4),
                  )
                : settings.tolerance / 4,
        leave = operation === 'rough' ? allowance : 0;
    const ball = tool.type === 'ball';
    const contact = createRotaryContact(
        mesh,
        cutterRadius + budget + leave + 1e-6,
    );
    const safe = radius + settings.clearance;
    const paths: Node[][] = [];
    const strategy = settings.strategy;
    const span = xmax - xmin;
    const stripWork = (dx: number, da: number) =>
        2 *
            Math.max(
                1,
                Math.ceil(
                    (Math.abs(dx) + (radius * Math.abs(da) * Math.PI) / 180) /
                        (2 * budget),
                ),
            ) +
        1;
    const steps = Math.max(
        1,
        Math.ceil(
            (strategy === 'along' ? 2 * Math.PI * radius : span) /
                settings.stepover,
        ),
    );
    const work =
        strategy === 'along'
            ? steps * stripWork(span, 0)
            : strategy === 'helix'
              ? 2 * stripWork(0, 360) +
                stripWork(span, (span / settings.stepover) * 360)
              : (steps + 1) * stripWork(0, 360) +
                steps * stripWork(span / steps, 0);
    let samples = 0,
        nodes = 0;
    const height = (x: number, a: number, guard: number) => {
        if (++samples > 2_000_000)
            throw new Error(
                'This rotary path is too large. Use a coarser finish quality or larger stepover.',
            );
        if ((samples & 1023) === 0) {
            if (aborted()) throw new Error('Rotary planning cancelled.');
            onProgress(Math.min(0.95, (0.95 * samples) / work));
        }
        const h = contact(x, a % 360, cutterRadius + guard + leave, ball);
        return Number.isFinite(h)
            ? h - (ball ? cutterRadius : 0) + (ball ? 0 : guard + leave) + 0.001
            : -radius;
    };
    const strip = (x0: number, x1: number, a0: number, a1: number) => {
        // Half the maximum relative tool/material travel bounds every point's
        // distance to the midpoint pose, including continuous angular motion.
        const travel =
            Math.abs(x1 - x0) + (radius * Math.abs(a1 - a0) * Math.PI) / 180;
        const count = Math.max(1, Math.ceil(travel / (2 * budget)));
        nodes += count + 1;
        if (nodes > 500_000)
            throw new Error(
                'This rotary path exceeds 500,000 moves. Use a coarser finish quality.',
            );
        const points: Node[] = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count,
                x = x0 + (x1 - x0) * t,
                a = a0 + (a1 - a0) * t;
            points.push({ x, y: 0, a, z: height(x, a, 0) });
        }
        for (let i = 1; i < points.length; i++) {
            const p = points[i - 1],
                q = points[i];
            const guard =
                Math.abs(q.x - p.x) / 2 +
                (radius * Math.abs(q.a - p.a) * Math.PI) / 360;
            const envelope = height((p.x + q.x) / 2, (p.a + q.a) / 2, guard);
            p.z = Math.max(p.z, envelope);
            q.z = Math.max(q.z, envelope);
        }
        return points;
    };
    if (strategy === 'along') {
        const count = Math.max(
            1,
            Math.ceil((2 * Math.PI * radius) / settings.stepover),
        );
        for (let i = 0; i < count; i++)
            paths.push(
                strip(
                    i % 2 ? xmax : xmin,
                    i % 2 ? xmin : xmax,
                    (i * 360) / count,
                    (i * 360) / count,
                ),
            );
    } else if (strategy === 'helix') {
        if (operation === 'rough')
            throw new Error(
                'Use Around stock or Along stock for roughing; Helix is a finishing strategy.',
            );
        const turns = (xmax - xmin) / settings.stepover;
        const start = strip(xmin, xmin, 0, 360);
        const spiral = strip(xmin, xmax, 360, 360 + turns * 360);
        const end = strip(xmax, xmax, 360 + turns * 360, 720 + turns * 360);
        start[start.length - 1].z = Math.max(
            start[start.length - 1].z,
            spiral[0].z,
        );
        spiral[spiral.length - 1].z = Math.max(
            spiral[spiral.length - 1].z,
            end[0].z,
        );
        paths.push(start.concat(spiral.slice(1), end.slice(1)));
    } else {
        const count = Math.max(1, Math.ceil((xmax - xmin) / settings.stepover));
        const path: Node[] = [];
        const append = (next: Node[]) => {
            if (path.length) {
                path[path.length - 1].z = Math.max(
                    path[path.length - 1].z,
                    next[0].z,
                );
                for (let i = 1; i < next.length; i++) path.push(next[i]);
            } else for (const p of next) path.push(p);
        };
        for (let i = 0; i <= count; i++) {
            const x = xmin + ((xmax - xmin) * i) / count;
            if (i) append(strip(path[path.length - 1].x, x, i * 360, i * 360));
            append(strip(x, x, i * 360, (i + 1) * 360));
        }
        paths.push(path);
    }
    onProgress(0.95);
    const moves: ToolpathMove[] = [];
    let previous: Node = { x: xmin, y: 0, z: safe, a: 0 };
    const push = (point: Node, rapid: boolean, feed = tool.feed) => {
        if (moves.length >= 500_000)
            throw new Error(
                'This rotary job exceeds 500,000 moves. Increase stepover or stepdown, or use a coarser finish quality.',
            );
        moves.push({
            ...point,
            op: operation,
            rapid,
            ...(!rapid
                ? {
                      f: feed,
                      minutes: blockMinutes(
                          previous,
                          point,
                          feed,
                          settings.rotaryRate,
                          radius,
                      ),
                  }
                : {}),
        });
        previous = point;
    };
    let bottom = radius;
    for (const path of paths)
        for (const p of path) bottom = Math.min(bottom, p.z);
    const levels =
        operation === 'rough'
            ? Math.max(1, Math.ceil((radius - bottom) / stepdown))
            : 1;
    for (let level = 1; level <= levels; level++) {
        onProgress(0.95 + (0.05 * (level - 1)) / levels);
        const floor =
            operation === 'rough' ? radius - level * stepdown : -Infinity;
        const offset =
            operation === 'rough' && strategy === 'around'
                ? (level - 1) *
                  paths[paths.length - 1][paths[paths.length - 1].length - 1].a
                : 0;
        for (const path of paths) {
            if (aborted()) throw new Error('Rotary planning cancelled.');
            const start = {
                ...path[0],
                a: path[0].a + offset,
                z: Math.max(path[0].z, floor),
            };
            push({ ...previous, z: safe }, true);
            push({ ...start, z: safe }, true);
            push(start, false, tool.plunge);
            for (const p of path.slice(1))
                push({ ...p, a: p.a + offset, z: Math.max(p.z, floor) }, false);
            push({ ...previous, z: safe }, true);
        }
    }
    onProgress(1);
    return moves;
}
