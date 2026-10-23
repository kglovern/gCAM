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

export function profileChuckConflict(
    samples: ProfileSample[],
    stock: RotaryStock,
    ops: RotaryOps,
    minX: number,
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
    return null;
}
