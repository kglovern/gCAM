import type { CanvasCamera } from './camera';
import type { PreviewLoop } from './types';

type Pocket = NonNullable<PreviewLoop['pocket']>;
const paths = new WeakMap<Pocket, Path2D>();

export function pocketPreviewRegion(
    operation: string,
    toolpath: Record<string, unknown>,
): Pocket | null {
    const contours = toolpath.pocketRegion,
        depthMm = Number(toolpath.cutDepth);
    if (
        operation !== 'pocket' ||
        !Array.isArray(contours) ||
        !Number.isFinite(depthMm) ||
        depthMm <= 0
    )
        return null;
    let points = 0;
    for (const contour of contours) {
        if (!Array.isArray(contour) || contour.length < 3) return null;
        for (const p of contour)
            if (
                ++points > 1000000 ||
                !p ||
                !Number.isFinite(p.x) ||
                !Number.isFinite(p.y)
            )
                return null;
    }
    return contours.length ? { contours, depthMm } : null;
}

export function pocketDepthRGB(depthMm: number, dark: boolean) {
    const depth = Math.max(0, depthMm),
        shade = depth / (depth + 8);
    const rgb = dark
        ? [50 - 25 * shade, 65 - 30 * shade, 85 - 35 * shade]
        : [232 - 50 * shade, 236 - 47 * shade, 240 - 44 * shade];
    return rgb.map(Math.round);
}
export const pocketDepthColor = (depthMm: number, dark: boolean) =>
    `rgb(${pocketDepthRGB(depthMm, dark).join(',')})`;

/** Depth cue for the programmed region, not a stock-removal simulation. */
export function drawPocketDepths(
    ctx: CanvasRenderingContext2D,
    preview: { pocket?: Pocket }[],
    camera: CanvasCamera,
    dark: boolean,
) {
    const pockets = preview
        .flatMap((p) =>
            p.pocket &&
            Number.isFinite(p.pocket.depthMm) &&
            p.pocket.depthMm > 0
                ? [p.pocket]
                : [],
        )
        .sort((a, b) => a.depthMm - b.depthMm);
    for (const pocket of pockets) {
        let path = paths.get(pocket);
        if (!path) {
            path = new Path2D();
            for (const contour of pocket.contours) {
                if (
                    contour.length < 3 ||
                    contour.some(
                        (p) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
                    )
                )
                    continue;
                path.moveTo(contour[0].x, contour[0].y);
                for (let i = 1; i < contour.length; i++)
                    path.lineTo(contour[i].x, contour[i].y);
                path.closePath();
            }
            paths.set(pocket, path);
        }
        ctx.save();
        ctx.translate(camera.tx, camera.ty);
        ctx.scale(camera.scale, -camera.scale);
        ctx.fillStyle = pocketDepthColor(pocket.depthMm, dark);
        ctx.fill(path, 'evenodd');
        ctx.clip(path, 'evenodd');
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.35)';
        ctx.lineWidth = 1 / camera.scale;
        ctx.shadowColor = dark ? 'rgba(0,0,0,0.85)' : 'rgba(15,23,42,0.5)';
        ctx.shadowBlur = Math.min(14, 2 + pocket.depthMm * camera.scale * 0.35);
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.stroke(path);
        ctx.restore();
    }
}
