/**
 * Purpose: Implementation module for gcode-validation in the cam domain.
 */
import { operationUsesTabs } from './tabs.js';

/** Validate emitted-machine constraints before producing any G-code. */
export function validateToolpaths(toolpaths) {
    for (const toolpath of toolpaths) {
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
