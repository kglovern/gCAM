import { PROFILE_SAMPLE_TOLERANCE } from './profileModel';
import { protectSupports, supportZones } from './supports';
import { defaultMeshSettings, meshSettingsForTool } from './meshToolpath';
import { planRotaryPaths, rotaryMotionBudget } from './rotaryPaths';
import {
    profileChuckMinX,
    profileTailMaxX,
    profileFixtureConflict,
} from './fixtureClearance';
import type {
    ProfileSample,
    RotaryStock,
    RotaryTool,
    RotaryOps,
    RotaryMeshSettings,
    ToolpathMove,
} from './types';

export function profileMachiningSettings(
    ops: Omit<RotaryOps, 'pommels' | 'compR'>,
    tool: RotaryTool,
    rough: boolean,
): RotaryMeshSettings {
    const settings =
        ops.mesh ??
        meshSettingsForTool(
            {
                ...defaultMeshSettings,
                strategy: ops.raster === 0 ? 'along' : 'around',
            },
            tool.dia,
            rough,
        );
    const strategy =
        settings.strategy === 'indexed' || settings.strategy === 'simultaneous'
            ? 'along'
            : rough && settings.strategy === 'helix'
              ? 'around'
              : settings.strategy;
    return {
        ...settings,
        ...(!ops.mesh ? { cellSize: defaultMeshSettings.cellSize } : {}),
        strategy,
    };
}

/** Exact contact with each linear profile segment at Y=0, including edge extrema. */
export function createProfileContact(samples: ProfileSample[]) {
    return (x: number, radius: number, ball: boolean) => {
        let height = -Infinity;
        let lo = 0,
            hi = samples.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (samples[mid].x < x - radius) lo = mid + 1;
            else hi = mid;
        }
        for (let i = Math.max(1, lo); i < samples.length; i++) {
            const p = samples[i - 1],
                q = samples[i];
            const dx = q.x - p.x,
                dr = q.r - p.r;
            if (p.x > x + radius) break;
            if (q.x < x - radius) continue;
            if (dx < 1e-12) {
                const h2 = radius * radius - (p.x - x) ** 2;
                if (h2 >= -1e-10)
                    height = Math.max(
                        height,
                        Math.max(p.r, q.r) +
                            (ball ? Math.sqrt(Math.max(0, h2)) : 0),
                    );
                continue;
            }
            const lo = Math.max(0, (x - radius - p.x) / dx),
                hi = Math.min(1, (x + radius - p.x) / dx);
            if (lo > hi) continue;
            const optimum = ball
                ? (x + (radius * dr) / Math.hypot(dx, dr) - p.x) / dx
                : dr >= 0
                  ? hi
                  : lo;
            const t = Math.max(lo, Math.min(hi, optimum));
            height = Math.max(
                height,
                p.r +
                    dr * t +
                    (ball
                        ? Math.sqrt(
                              Math.max(
                                  0,
                                  radius * radius - (p.x + dx * t - x) ** 2,
                              ),
                          )
                        : 0),
            );
        }
        return height;
    };
}

export function planProfilePaths(
    samples: ProfileSample[],
    stock: RotaryStock,
    tool: RotaryTool,
    ops: RotaryOps,
    operation: 'rough' | 'finish',
    onProgress: (fraction: number) => void = () => {},
): ToolpathMove[] {
    if (
        samples.length < 2 ||
        samples.some(
            (p, i) =>
                !Number.isFinite(p.x) ||
                !Number.isFinite(p.r) ||
                p.r < 0 ||
                (i > 0 && p.x < samples[i - 1].x),
        )
    )
        throw new Error(
            'Use a profile with at least two points in increasing X order.',
        );
    if (tool.type !== 'flat' && tool.type !== 'ball')
        throw new Error(
            'Choose a flat or straight ball endmill for profile roughing and finishing.',
        );
    const settings = profileMachiningSettings(ops, tool, operation === 'rough');
    if (
        [
            settings.tolerance,
            settings.stepover,
            settings.clearance,
            settings.rotaryRate,
            ops.roughStep,
            tool.dia,
            tool.feed,
            tool.plunge,
            tool.spindle,
            stock.length,
            stock.diameter,
        ].some((v) => !Number.isFinite(v) || v <= 0)
    )
        throw new Error(
            'Use positive cutting quality, stepover, clearance, rotary speed and pass depth.',
        );
    if (settings.stepover > tool.dia / 2)
        throw new Error(
            `Stepover is ${settings.stepover} mm; use at most ${tool.dia / 2} mm for this cutter.`,
        );
    const xmin = Math.max(
        samples[0].x,
        profileChuckMinX(stock, tool, { ...ops, mesh: settings }),
    );
    const xmax = Math.min(stock.length, samples[samples.length - 1].x);
    const conflict = profileFixtureConflict(
        samples,
        stock,
        ops,
        xmin,
        profileTailMaxX(stock, tool, { ...ops, mesh: settings }),
    );
    if (conflict) throw new Error(conflict);
    if (!(xmax > xmin))
        throw new Error(
            'Profile has no machinable length beyond chuck clearance.',
        );
    if (samples.some((p) => p.r > stock.diameter / 2 + 1e-6))
        throw new Error(
            'Profile exceeds the blank diameter. Increase the stock diameter or reduce the profile.',
        );
    const budget = rotaryMotionBudget(
        stock,
        tool,
        operation,
        ops.roughStep,
        settings,
    );
    const leave = operation === 'rough' ? ops.allow : 0;
    const radius = tool.dia / 2,
        ball = tool.type === 'ball';
    const contact = createProfileContact(samples);
    let ranges: [number, number][] = [[xmin, xmax]];
    for (const zone of ops.pommels) {
        const a = Math.min(zone.x0, zone.x1) - radius - budget - leave - 0.001;
        const b = Math.max(zone.x0, zone.x1) + radius + budget + leave + 0.001;
        ranges = ranges.flatMap(([lo, hi]) =>
            b <= lo || a >= hi
                ? [[lo, hi] as [number, number]]
                : ([
                      [lo, Math.min(a, hi)],
                      [Math.max(b, lo), hi],
                  ].filter(([p, q]) => q > p) as [number, number][]),
        );
    }
    if (!ranges.length)
        throw new Error(
            'Square sections cover the machinable profile. Reduce their ranges.',
        );
    const moves: ToolpathMove[] = [];
    let angle = 0;
    ranges.forEach(([lo, hi], index) => {
        const path = planRotaryPaths(
            stock,
            tool,
            operation,
            ops.roughStep,
            settings,
            lo,
            hi,
            () => false,
            (x, _a, guard) =>
                contact(
                    x,
                    radius + guard + leave + PROFILE_SAMPLE_TOLERANCE,
                    ball,
                ) -
                (ball ? radius : 0) +
                (ball ? 0 : guard + leave + PROFILE_SAMPLE_TOLERANCE) +
                0.001,
            (fraction) => onProgress((index + fraction) / ranges.length),
        );
        for (const move of path)
            moves.push({ ...move, a: (move.a ?? 0) + angle });
        angle = moves[moves.length - 1]?.a ?? angle;
        if (moves.length > 500_000)
            throw new Error(
                'Profile toolpath exceeds 500,000 moves. Use a coarser quality or larger stepover.',
            );
    });
    return protectSupports(
        moves,
        supportZones(stock, samples[0].x, samples[samples.length - 1].x),
        tool,
        settings,
    );
}
