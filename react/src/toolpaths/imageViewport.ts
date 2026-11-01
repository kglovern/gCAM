export type ImageViewport = { scale: number; x: number; y: number };
export function fitImageViewport(
    width: number,
    height: number,
    paneWidth: number,
    paneHeight: number,
): ImageViewport {
    const scale = Math.min(
        128,
        (paneWidth - 16) / width,
        (paneHeight - 16) / height,
    );
    return {
        scale,
        x: (paneWidth - width * scale) / 2,
        y: (paneHeight - height * scale) / 2,
    };
}
export function zoomImageViewport(
    view: ImageViewport,
    factor: number,
    anchor: { x: number; y: number },
): ImageViewport {
    const scale = Math.max(0.000001, Math.min(128, view.scale * factor)),
        ratio = scale / view.scale;
    return {
        scale,
        x: anchor.x - (anchor.x - view.x) * ratio,
        y: anchor.y - (anchor.y - view.y) * ratio,
    };
}
