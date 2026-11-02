import { svgImagePlan, SVG_IMAGE_PIXELS } from '../engine/svg-image.js';
import { createDocumentId } from './ids';
export interface ImportedBitmap {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    dataUrl: string;
    img?: HTMLImageElement;
}
type Point = { x: number; y: number };
type Matrix = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
};
type Plan = {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    corners: Point[];
} & (
    | { direct: true; flipY: boolean }
    | {
          direct: false;
          outW: number;
          outH: number;
          matrix: Matrix;
          clips: Point[][];
      }
);
const imageOf = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
            reject(new Error('Could not decode an embedded SVG image.'));
        image.src = url;
    });
function canvasOf(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    return { canvas, ctx };
}
/** Parser entities are validated before decoding; all assets finish before document commit. */
export async function prepareSvgImages(entities: any[], scaleToMm = 1) {
    const result: any[] = [],
        bitmaps: ImportedBitmap[] = [],
        cache = new Map<string, Promise<HTMLImageElement>>();
    let pixels = 0,
        renderedPixels = 0;
    for (const source of entities) {
        if (source.type !== 'SVG_IMAGE') {
            result.push(source);
            continue;
        }
        let decoded = cache.get(source.dataUrl);
        if (!decoded) {
            decoded = imageOf(source.dataUrl);
            cache.set(source.dataUrl, decoded);
        }
        let img = await decoded,
            dataUrl = source.dataUrl;
        pixels += img.naturalWidth * img.naturalHeight;
        if (pixels > SVG_IMAGE_PIXELS * 2)
            throw new Error(
                'SVG images exceed the combined 32 million pixel limit.',
            );
        const plan = svgImagePlan(
            source,
            img.naturalWidth,
            img.naturalHeight,
            scaleToMm,
        ) as Plan | null;
        if (!plan) continue;
        renderedPixels += plan.direct
            ? img.naturalWidth * img.naturalHeight
            : plan.outW * plan.outH;
        if (renderedPixels > SVG_IMAGE_PIXELS * 2)
            throw new Error(
                'Rendered SVG images exceed the combined 32 million pixel limit.',
            );
        if (!plan.direct || plan.flipY || source.opacity !== 1) {
            const { canvas, ctx } = canvasOf(
                plan.direct ? img.naturalWidth : plan.outW,
                plan.direct ? img.naturalHeight : plan.outH,
            );
            try {
                ctx.globalAlpha = source.opacity;
                if (plan.direct) {
                    if (plan.flipY) {
                        ctx.translate(0, canvas.height);
                        ctx.scale(1, -1);
                    }
                } else {
                    const sx = canvas.width / plan.w,
                        sy = canvas.height / plan.h;
                    ctx.setTransform(
                        sx,
                        0,
                        0,
                        -sy,
                        -plan.x * sx,
                        (plan.y + plan.h) * sy,
                    );
                    for (const clip of plan.clips) {
                        ctx.beginPath();
                        ctx.moveTo(clip[0].x, clip[0].y);
                        for (let i = 1; i < clip.length; i++)
                            ctx.lineTo(clip[i].x, clip[i].y);
                        ctx.closePath();
                        ctx.clip();
                    }
                    const m = plan.matrix;
                    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
                }
                ctx.drawImage(img, 0, 0);
                dataUrl = canvas.toDataURL('image/png');
                if (!dataUrl.startsWith('data:image/png'))
                    throw new Error('Could not render an embedded SVG image.');
                img = await imageOf(dataUrl);
            } finally {
                canvas.width = canvas.height = 0;
            }
        }
        const id = createDocumentId('bitmap');
        bitmaps.push({
            id,
            x: plan.x,
            y: plan.y,
            w: plan.w,
            h: plan.h,
            rotation: plan.rotation,
            dataUrl,
            img,
        });
        result.push({
            type: 'POLYLINE',
            layer: source.layer,
            layerName: source.layerName,
            layerColor: source.layerColor,
            handle: '',
            color: 256,
            bitmapId: id,
            vertices: plan.corners.map((p) => ({ ...p, bulge: 0 })),
            closed: true,
        });
    }
    return { entities: result, bitmaps };
}
