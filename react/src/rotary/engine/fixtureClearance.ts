import type {
    ProfileSample,
    RotaryOps,
    RotaryStock,
    RotaryTool,
} from './types';

export const defaultFixtureSettings = {
    shankDiameter: 0,
    holderDiameter: 0,
    clearance: 5,
    cellSize: 0.25,
    tailClearance: 6,
};
type FixtureSettings = typeof defaultFixtureSettings;

/** Axial tool-centre margin from a fixture, including the configured tool assembly. */
export function fixtureXClearance(
    tool: RotaryTool,
    settings: FixtureSettings = defaultFixtureSettings,
) {
    return (
        Math.max(
            tool.dia / 2,
            settings.shankDiameter / 2,
            settings.holderDiameter / 2,
        ) +
        settings.clearance +
        2 * settings.cellSize
    );
}

export function profileChuckMinX(
    stock: RotaryStock,
    tool: RotaryTool,
    ops: RotaryOps & { mesh?: FixtureSettings },
) {
    return stock.grip + fixtureXClearance(tool, ops.mesh);
}

export function profileFixtureConflict(
    samples: ProfileSample[],
    stock: RotaryStock,
    ops: RotaryOps,
    minX: number,
    maxX = Infinity,
): string | null {
    if (
        (ops.face || ops.rough || ops.finish) &&
        Math.min(stock.length, samples[samples.length - 1].x) < minX
    )
        return 'Profile is inside chuck clearance. Move it farther from the chuck.';
    if (ops.groove.on && ops.groove.x - ops.groove.w / 2 < minX)
        return 'Groove overlaps chuck clearance. Move it farther from the chuck.';
    if (ops.part.on && Math.min(ops.part.x, stock.length - 1) < minX)
        return 'Part-off overlaps chuck clearance. Move it farther from the chuck.';
    if (
        (ops.face || ops.rough || ops.finish) &&
        Math.min(stock.length, samples[samples.length - 1].x) > maxX
    )
        return 'Profile overlaps tailstock clearance. Increase the blank length or move the profile.';
    if (ops.groove.on && ops.groove.x + ops.groove.w / 2 > maxX)
        return 'Groove overlaps tailstock clearance. Move it away from the tailstock.';
    if (ops.part.on && Math.min(ops.part.x, stock.length - 1) > maxX)
        return 'Part-off overlaps tailstock clearance. Move it away from the tailstock.';
    return null;
}

export function profileTailMaxX(
    stock: RotaryStock,
    tool: RotaryTool,
    ops: RotaryOps & { mesh?: FixtureSettings },
) {
    const settings = ops.mesh ?? defaultFixtureSettings;
    return (
        stock.length -
        settings.tailClearance -
        fixtureXClearance(tool, settings)
    );
}
