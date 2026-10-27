/** Millimetres use one pixel scale on both axes, independent of the panel aspect. */
export function profileCamera(
    width: number,
    height: number,
    length: number,
    diameter: number,
    zoom: number,
    panX: number,
    panY: number,
) {
    const scale =
        Math.max(
            0.01,
            Math.min(
                (width - 44) / (length + 4),
                (height - 46) / Math.max(diameter / 2 + 2, 8),
            ),
        ) * zoom;
    return {
        scale,
        x: (value: number) => 34 + value * scale - panX,
        r: (value: number) => height - 24 - value * scale + panY,
        invX: (pixel: number) => (pixel - 34 + panX) / scale,
        invR: (pixel: number) => (height - 24 + panY - pixel) / scale,
    };
}

export function zoomProfileAt(
    zoom: number,
    panX: number,
    panY: number,
    nextZoom: number,
    x: number,
    y: number,
    height: number,
) {
    const next = Math.max(0.125, Math.min(32, nextZoom));
    const ratio = next / zoom;
    return {
        zoom: next,
        panX: (x - 34 + panX) * ratio - (x - 34),
        panY: panY * ratio + (1 - ratio) * (y - height + 24),
    };
}
