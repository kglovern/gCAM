/** Sharp, flat 2D edges with an ideal pointed V-bit. Tip offset is axial (Z). */
export function edgeChamferDimensions(width, tipOffset, angle, diameter) {
    if (
        ![width, tipOffset, angle, diameter].every(Number.isFinite) ||
        width <= 0 ||
        tipOffset < 0 ||
        angle <= 0 ||
        angle >= 180 ||
        diameter <= 0
    )
        throw new Error(
            'Chamfer needs a positive width, non-negative tip offset and a valid V-bit.',
        );
    const slope = Math.tan((angle * Math.PI) / 360),
        offset = tipOffset * slope,
        cutDepth = width / slope + tipOffset;
    if (
        !Number.isFinite(cutDepth) ||
        cutDepth > 1000000 ||
        width + offset > diameter / 2 + 1e-8
    )
        throw new Error(
            'Chamfer exceeds the V-bit diameter. Reduce width or tip offset, or use a larger V-bit.',
        );
    if (cutDepth < 0.01)
        throw new Error('Chamfer tip depth must be at least 0.01 mm.');
    return { cutDepth, offset };
}

export function normalizeChamfer(config) {
    if (config.operation !== 'chamfer' || config.chamferWidthMm === undefined)
        return config;
    const dimensions = edgeChamferDimensions(
        config.chamferWidthMm,
        config.chamferTipOffsetMm ?? 0,
        config.cutterAngle,
        config.toolDiameter,
    );
    if (
        config.stockThicknessMm !== undefined &&
        (!Number.isFinite(config.stockThicknessMm) ||
            dimensions.cutDepth > config.stockThicknessMm)
    )
        throw new Error(
            'Chamfer tip would go below the stock. Reduce width or tip offset.',
        );
    return { ...config, cutDepth: dimensions.cutDepth };
}
