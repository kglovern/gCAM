import {
    laserLeadEndpoints,
    validateLaserLeadClearance,
} from './laser-leads.js';
/**
 * Purpose: Implementation module for gcode-validation in the cam domain.
 */
import { laserOvercutPoints } from './laser-overcut.js';
import { edgeChamferDimensions } from './chamfer.js';
import { validateLaserFocusTest } from './laser-focus.js';
import { operationUsesTabs } from './tabs.js';

/** Validate emitted-machine constraints before producing any G-code. */
export function validateToolpaths(toolpaths) {
    for (const toolpath of toolpaths) {
        if (
            toolpath.vCarveInset &&
            (toolpath.operation !== 'pocket' ||
                Math.abs(toolpath.cutDepth - toolpath.vCarveInset.depth) > 1e-6)
        )
            throw new Error(
                'Clearing depth changed. Regenerate the linked V-carve toolpaths.',
            );
        if (
            toolpath.operation === 'chamfer' &&
            toolpath.chamferWidthMm !== undefined
        ) {
            const expected = edgeChamferDimensions(
                toolpath.chamferWidthMm,
                toolpath.chamferTipOffsetMm ?? 0,
                toolpath.cutterAngle,
                toolpath.toolDiameter,
            );
            if (
                !Number.isFinite(toolpath.cutDepth) ||
                Math.abs(expected.cutDepth - toolpath.cutDepth) > 1e-7
            )
                throw new Error(
                    'Chamfer dimensions changed. Regenerate this toolpath.',
                );
        }
        if (
            ['laser-cut', 'laser-raster', 'laser-fill'].includes(
                toolpath.operation,
            )
        ) {
            validateLaserFocusTest(toolpath);
            if (
                typeof (toolpath.laserOptions?.preferCornerStarts ?? false) !==
                'boolean'
            )
                throw new Error('Invalid laser corner-start preference.');
            if (
                ![
                    'none',
                    'left-to-right',
                    'right-to-left',
                    'top-to-bottom',
                    'bottom-to-top',
                ].includes(toolpath.laserOptions?.cutOrder ?? 'none')
            )
                throw new Error('Invalid laser cut order.');
            if (
                !['profile', 'dynamic', 'constant'].includes(
                    toolpath.laserOptions?.powerMode ?? 'profile',
                )
            )
                throw new Error('Invalid laser power control.');
            if (!Number.isFinite(toolpath.laserFeed) || toolpath.laserFeed <= 0)
                throw new Error('Laser feed must be greater than zero.');
            for (const power of [
                toolpath.laserPower,
                toolpath.laserSMin ?? 0,
                toolpath.laserSMax ?? 1000,
            ]) {
                if (!Number.isFinite(power) || power < 0 || power > 1000)
                    throw new Error('Laser power must be between 0 and 1000.');
            }
            if ((toolpath.laserSMin ?? 0) > (toolpath.laserSMax ?? 1000))
                throw new Error(
                    'Laser minimum power cannot exceed maximum power.',
                );
            const overcut = toolpath.laserOptions?.overcut ?? 0;
            if (!Number.isFinite(overcut) || overcut < 0 || overcut > 10000)
                throw new Error('Invalid laser overcut.');
            if (
                toolpath.operation === 'laser-cut' &&
                overcut > 0 &&
                !Array.isArray(toolpath.laserPaths)
            )
                throw new Error(
                    'Rebuild this laser toolpath before using overcut.',
                );
            const hasLeads =
                (toolpath.laserOptions?.leadInLength ?? 0) > 0 ||
                (toolpath.laserOptions?.leadOutLength ?? 0) > 0;
            for (const [key, min, max] of [
                ['leadInLength', 0, 10000],
                ['leadOutLength', 0, 10000],
                ['leadInAngle', -180, 180],
                ['leadOutAngle', -180, 180],
            ]) {
                const value =
                    toolpath.laserOptions?.[key] ??
                    (key.endsWith('Angle') ? 45 : 0);
                if (!Number.isFinite(value) || value < min || value > max)
                    throw new Error('Invalid laser lead settings.');
            }
            if (
                hasLeads &&
                toolpath.operation === 'laser-cut' &&
                !Array.isArray(toolpath.laserPaths)
            )
                throw new Error(
                    'Rebuild this laser toolpath before using leads.',
                );
            if (toolpath.laserPaths) {
                if (
                    !Array.isArray(toolpath.laserPaths) ||
                    !Number.isInteger(toolpath.laserOptions?.passes) ||
                    toolpath.laserOptions.passes < 1 ||
                    toolpath.laserOptions.passes > 100
                )
                    throw new Error('Invalid saved laser paths or passes.');
                for (const path of toolpath.laserPaths) {
                    if (path.focusZMm !== undefined && !toolpath.laserFocusTest)
                        throw new Error(
                            'Laser Z moves require an explicit focus-test setup.',
                        );
                    if (
                        !Array.isArray(path.points) ||
                        (path.feed !== undefined &&
                            (!Number.isFinite(path.feed) || path.feed <= 0))
                    )
                        throw new Error('Invalid saved laser path.');
                    for (const point of path.points)
                        if (
                            !Number.isFinite(point.x) ||
                            !Number.isFinite(point.y) ||
                            !Number.isFinite(point.power) ||
                            point.power < 0 ||
                            point.power > 1000
                        )
                            throw new Error(
                                'Invalid saved laser motion or power.',
                            );
                }
                if (
                    toolpath.operation === 'laser-cut' &&
                    (overcut > 0 || hasLeads)
                ) {
                    let budget =
                        2000000 -
                        toolpath.laserPaths.reduce(
                            (n, p) => n + p.points.length,
                            0,
                        ) *
                            toolpath.laserOptions.passes;
                    for (const path of toolpath.laserPaths) {
                        const extra = laserOvercutPoints(
                            path.points,
                            overcut,
                            budget,
                        );
                        budget -= extra ? extra.length - 1 : 0;
                        if (hasLeads) {
                            if (typeof path.laserLeadInside !== 'boolean')
                                throw new Error(
                                    'Rebuild this laser toolpath before using leads.',
                                );
                            if (
                                toolpath.laserPower > 0 &&
                                ((toolpath.laserOptions.leadInLength > 0 &&
                                    path.points[1]?.power === 0) ||
                                    (toolpath.laserOptions.leadOutLength > 0 &&
                                        (path.points[path.points.length - 1]
                                            ?.power === 0 ||
                                            extra?.[extra.length - 1]?.power ===
                                                0)))
                            )
                                throw new Error(
                                    'Laser lead starts in an uncut gap; adjust overcut or disable the lead.',
                                );
                            laserLeadEndpoints(
                                path,
                                toolpath.laserOptions,
                                toolpath.laserPower,
                                extra,
                            );
                            budget -=
                                ((toolpath.laserOptions.leadInLength ? 1 : 0) +
                                    (toolpath.laserOptions.leadOutLength
                                        ? 1
                                        : 0)) *
                                toolpath.laserOptions.passes;
                            if (budget < 0)
                                throw new Error(
                                    'Laser leads exceed the job point budget; reduce passes.',
                                );
                        }
                    }
                    if (hasLeads) {
                        validateLaserLeadClearance(
                            toolpath.laserPaths,
                            toolpath.laserOptions,
                            toolpath.laserPower,
                        );
                        if (overcut > 0)
                            validateLaserLeadClearance(
                                toolpath.laserPaths,
                                toolpath.laserOptions,
                                toolpath.laserPower,
                                true,
                            );
                    }
                }
            }
            continue;
        }
        const values = [
            ['Z Safe', toolpath.safeZ],
            ['Feed Rate', toolpath.feedRate],
            ['Plunge Rate', toolpath.plungeRate],
            ['Spindle RPM', toolpath.spindle],
            ['Tool diameter', toolpath.toolDiameter],
        ];
        const invalidValue = values.find(
            ([, value]) =>
                !Number.isFinite(Number(value)) || Number(value) <= 0,
        );
        if (invalidValue) {
            throw new Error(
                `${invalidValue[0]} must be greater than zero for ${toolpath.label || 'each toolpath'}.`,
            );
        }
        const requiresVBit = [
            'vcarve',
            'texture-fill',
            'chamfer',
            'countersink',
        ].includes(toolpath.operation);
        if (toolpath.operation === 'surface-clear') {
            if (toolpath.cutterType !== 'flat')
                throw new Error(
                    `3D surface clearing requires a flat endmill for ${toolpath.label || 'each toolpath'}.`,
                );
            if (
                !Number.isFinite(Number(toolpath.toolNumber)) ||
                Number(toolpath.toolNumber) < 1
            )
                throw new Error(
                    `Choose a configured flat endmill from the tool library for ${toolpath.label || 'each toolpath'}.`,
                );
            if (
                typeof toolpath.libraryToolId !== 'string' ||
                !toolpath.libraryToolId
            )
                throw new Error(
                    `Choose a flat endmill from the tool library for ${toolpath.label || 'each toolpath'}.`,
                );
        }
        if (
            toolpath.operation === 'surface-finish' ||
            toolpath.operation === 'surface-waterline'
        ) {
            if (!['ball', 'ballnose'].includes(toolpath.cutterType))
                throw new Error(
                    `3D surface finishing requires a ball-nose endmill for ${toolpath.label || 'each toolpath'}.`,
                );
            if (
                !Number.isFinite(Number(toolpath.toolNumber)) ||
                Number(toolpath.toolNumber) < 1
            )
                throw new Error(
                    `Choose a configured ball-nose endmill from the tool library for ${toolpath.label || 'each toolpath'}.`,
                );
            if (
                typeof toolpath.libraryToolId !== 'string' ||
                !toolpath.libraryToolId
            )
                throw new Error(
                    `Choose a ball endmill from the tool library for ${toolpath.label || 'each toolpath'}.`,
                );
        }
        if (
            requiresVBit &&
            (!Number.isFinite(Number(toolpath.cutterAngle)) ||
                Number(toolpath.cutterAngle) <= 0 ||
                Number(toolpath.cutterAngle) >= 180)
        ) {
            throw new Error(
                `V-bit angle must be between 1 and 179 degrees for ${toolpath.label || 'each toolpath'}.`,
            );
        }
        const isDepthless = [
            'vcarve',
            'laser-raster',
            'laser-cut',
            'wavy-raster',
            'surface-clear',
            'surface-finish',
            'surface-waterline',
        ].includes(toolpath.operation);
        if (isDepthless) continue;
        const passDepth = Number(toolpath.passDepth);
        const cutDepth = Number(toolpath.cutDepth);
        if (!Number.isFinite(passDepth) || passDepth <= 0) {
            throw new Error(
                `Pass depth must be greater than zero for ${toolpath.label || 'each toolpath'}.`,
            );
        }
        if (operationUsesTabs(toolpath)) {
            const tabHeight = Number(toolpath.tabHeight);
            if (
                !Number.isFinite(tabHeight) ||
                tabHeight < 0 ||
                tabHeight >= cutDepth
            ) {
                throw new Error(
                    `Tab height must be zero or greater and less than final depth for ${toolpath.label || 'each toolpath'}.`,
                );
            }
            if ((toolpath.tabs || []).length) {
                const tabWidth = Number(toolpath.tabWidth);
                if (
                    !Number.isFinite(tabWidth) ||
                    tabWidth < 3 ||
                    tabWidth > 50
                ) {
                    throw new Error(
                        `Tab width must be between 3 and 50 mm for ${toolpath.label || 'each toolpath'}.`,
                    );
                }
            }
        }
        if (toolpath.trochoidEnabled) {
            const supported = [
                'profile-outside',
                'profile-inside',
                'pocket',
            ].includes(toolpath.operation);
            if (!supported) {
                throw new Error(
                    `Trochoidal cutting is only supported for inside and outside profiles (${toolpath.label || 'each toolpath'}).`,
                );
            }
            const engagement = Number(toolpath.trochoidEngagementPercent);
            const radius = Number(toolpath.trochoidRadius);
            if (
                (!Number.isFinite(engagement) ||
                    engagement < 2 ||
                    engagement > 40) &&
                (!Number.isFinite(radius) ||
                    radius <= 0 ||
                    radius > Number(toolpath.toolDiameter) * 0.4)
            ) {
                throw new Error(
                    `Trochoidal engagement must be between 2% and 40% for ${toolpath.label || 'each toolpath'}.`,
                );
            }
        }
    }
}
