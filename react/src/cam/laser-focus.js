/** Explicit Z contract for a standalone focus-calibration job. Ordinary laser paths remain XY-only. */
export function validateLaserFocusTest(toolpath) {
    const focus = toolpath.laserFocusTest;
    if (focus === undefined) return null;
    if (
        !focus ||
        !['ramp', 'sweep'].includes(focus.mode) ||
        !Array.isArray(toolpath.laserPaths)
    )
        throw new Error('Invalid laser focus test.');
    const bounds = focus.stockBounds;
    if (
        !bounds ||
        ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(
            Number.isFinite,
        ) ||
        bounds.maxX <= bounds.minX ||
        bounds.maxY <= bounds.minY
    )
        throw new Error('Invalid focus-test stock bounds.');
    if (toolpath.laserRotary || toolpath.laserOptions?.passes !== 1)
        throw new Error('Focus tests require one flat laser pass.');
    if (focus.mode === 'ramp') {
        if (toolpath.laserPaths.some((path) => path.focusZMm !== undefined))
            throw new Error('Manual ramp tests cannot contain Z moves.');
        return null;
    }
    if (
        focus.controlledZ !== true ||
        ![
            focus.minZMm,
            focus.maxZMm,
            focus.travelZMm,
            focus.zFeedMmMin,
            focus.stepMm,
        ].every(Number.isFinite) ||
        focus.minZMm >= focus.maxZMm ||
        Math.max(Math.abs(focus.minZMm), Math.abs(focus.maxZMm)) > 10000 ||
        focus.travelZMm < focus.minZMm ||
        focus.travelZMm > focus.maxZMm ||
        focus.zFeedMmMin <= 0 ||
        focus.zFeedMmMin > 1000000 ||
        ![1, -1].includes(focus.clearanceDirection) ||
        focus.stepMm < 0.01
    )
        throw new Error(
            'Configure motorized Z, its work range, travel height and feed before exporting.',
        );
    for (const path of toolpath.laserPaths) {
        const z = path.focusZMm;
        if (
            !Number.isFinite(z) ||
            z < focus.minZMm ||
            z > focus.maxZMm ||
            (focus.clearanceDirection === 1
                ? z > focus.travelZMm
                : z < focus.travelZMm)
        )
            throw new Error(
                'Focus heights must fit the configured work range and clearance direction.',
            );
    }
    return focus;
}
