import { compositePocketSeedPaths } from '../cam/geometry/polygons.js';
import { pngPhysicalSize } from '../platform/processedImagePng';
export type VectorBitmapRequest = {
    shapes: { id: string; points: { x: number; y: number }[] }[];
    fillIds: string[];
    render: 'outline' | 'fill' | 'operations';
    dpi: number;
    lineWidth: number;
};
export function vectorBitmapPlan(request: VectorBitmapRequest) {
    const { shapes, dpi, lineWidth, render } = request;
    if (
        !Array.isArray(shapes) ||
        !shapes.length ||
        shapes.length > 10000 ||
        !Array.isArray(request.fillIds) ||
        !['outline', 'fill', 'operations'].includes(render) ||
        !Number.isFinite(dpi) ||
        dpi < 25 ||
        dpi > 2400 ||
        !Number.isFinite(lineWidth) ||
        lineWidth < 0.001 ||
        lineWidth > 100
    )
        throw new Error('Invalid bitmap conversion settings.');
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        count = 0;
    const fillIds = new Set(request.fillIds);
    const fills: VectorBitmapRequest['shapes'] = [],
        outlines: VectorBitmapRequest['shapes'] = [];
    for (const shape of shapes) {
        count += Array.isArray(shape.points) ? shape.points.length : 0;
        if (
            !Array.isArray(shape.points) ||
            shape.points.length < 2 ||
            count > 1000000
        )
            throw new Error(
                'Selection is too complex or contains invalid shapes.',
            );
        const points = shape.points;
        const closed =
            points.length > 3 &&
            Math.hypot(
                points[0].x - points[points.length - 1].x,
                points[0].y - points[points.length - 1].y,
            ) < 1e-7;
        const fill =
            render === 'fill' ||
            (render === 'operations' && fillIds.has(shape.id));
        if (fill && !closed)
            throw new Error(
                'Fill requires closed shapes; choose Outlines for open paths.',
            );
        (fill ? fills : outlines).push(shape);
        for (const p of points) {
            if (
                ![p.x, p.y].every(Number.isFinite) ||
                Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000
            )
                throw new Error('Invalid shape coordinates.');
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    const pad = outlines.length ? lineWidth / 2 : 0;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const widthMm = maxX - minX,
        heightMm = maxY - minY;
    const widthPx = Math.ceil((widthMm * dpi) / 25.4 - 1e-9),
        heightPx = Math.ceil((heightMm * dpi) / 25.4 - 1e-9);
    if (
        !(widthPx > 0 && heightPx > 0) ||
        widthPx > 32768 ||
        heightPx > 32768 ||
        widthPx * heightPx > 16777216
    )
        throw new Error(
            'Bitmap exceeds 16 million pixels or canvas limits; reduce DPI.',
        );
    return {
        bounds: { minX, minY, maxX, maxY },
        widthMm,
        heightMm,
        widthPx,
        heightPx,
        lineWidth,
        fills,
        outlines,
    };
}
export type PreparedVectorBitmap = Omit<
    ReturnType<typeof vectorBitmapPlan>,
    'fills' | 'outlines'
> & {
    fills: { x: number; y: number }[][];
    outlines: { x: number; y: number }[][];
};
export function prepareVectorBitmap(
    request: VectorBitmapRequest,
): PreparedVectorBitmap {
    const plan = vectorBitmapPlan(request);
    const fills = plan.fills.length
        ? compositePocketSeedPaths(plan.fills, 0)
        : [];
    if (plan.fills.length && !fills.length)
        throw new Error('No closed areas remain to fill.');
    return {
        ...plan,
        fills,
        outlines: plan.outlines.map((shape) => shape.points),
    };
}
export function paintVectorBitmap(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    plan: PreparedVectorBitmap,
) {
    context.fillStyle = 'white';
    context.fillRect(0, 0, plan.widthPx, plan.heightPx);
    context.setTransform(
        plan.widthPx / plan.widthMm,
        0,
        0,
        -plan.heightPx / plan.heightMm,
        (-plan.bounds.minX * plan.widthPx) / plan.widthMm,
        (plan.bounds.maxY * plan.heightPx) / plan.heightMm,
    );
    const path = (paths: { x: number; y: number }[][]) => {
        context.beginPath();
        for (const points of paths) {
            context.moveTo(points[0].x, points[0].y);
            for (const p of points.slice(1)) context.lineTo(p.x, p.y);
            if (
                points[0].x === points[points.length - 1].x &&
                points[0].y === points[points.length - 1].y
            )
                context.closePath();
        }
    };
    context.fillStyle = '#808080';
    context.strokeStyle = '#808080';
    context.lineWidth = plan.lineWidth;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    path(plan.fills);
    context.fill('nonzero');
    path(plan.outlines);
    context.stroke();
}
export async function vectorBitmapPng(blob: Blob, plan: PreparedVectorBitmap) {
    return pngPhysicalSize(
        new Uint8Array(await blob.arrayBuffer()),
        plan.widthMm,
        plan.heightMm,
    ).buffer;
}
export type VectorBitmapResult = {
    plan: PreparedVectorBitmap;
    png?: ArrayBuffer;
};
