import {
    FULL_IMAGE,
    validateImageRegion,
    validateImageMaskSources,
} from '../cam/raster-region.js';
import type { ViewLoop } from '../canvas/types';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
export function normalizedImageMask(
    polygons: { x: number; y: number }[][],
    image: { x: number; y: number; w: number; h: number; rotation?: number },
) {
    if (
        ![image.x, image.y, image.w, image.h, image.rotation ?? 0].every(
            Number.isFinite,
        ) ||
        image.w <= 0 ||
        image.h <= 0 ||
        polygons.length > 1000 ||
        polygons.some((p) => !Array.isArray(p)) ||
        polygons.reduce((sum, p) => sum + p.length, 0) > 20000
    )
        throw new Error('Invalid or overly detailed mask source geometry.');
    const angle = ((image.rotation ?? 0) * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
    const mask = polygons.map((poly) =>
        poly.map((p) => {
            const x = p.x - image.x - image.w / 2,
                y = p.y - image.y - image.h / 2;
            return {
                x: 0.5 + (x * c + y * s) / image.w,
                y: 0.5 + (-x * s + y * c) / image.h,
            };
        }),
    );
    validateImageRegion(FULL_IMAGE, mask);
    return mask;
}

export function resolveLinkedImageMask(
    image: {
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        maskSourceIds?: string[];
    },
    loops: ViewLoop[],
) {
    const ids = image.maskSourceIds ?? [];
    validateImageMaskSources(ids);
    if (!ids.length) return [];
    const byId = new Map(loops.map((l) => [l.id, l]));
    const sources = ids.map((id) => {
        const source = byId.get(id);
        if (!source || source.bitmapId)
            throw new Error(
                'Linked mask shape is missing. Relink shapes or remove the mask.',
            );
        return source.points;
    });
    return normalizedImageMask(sources, image);
}
export function linkedMaskExportError(
    stack: ToolpathStackEntry[],
    loops: ViewLoop[],
    bitmaps: Pick<
        PlacedBitmapRecord,
        'id' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'maskSourceIds'
    >[],
) {
    const currentMasks = new Map<string, string>();
    for (const entry of stack) {
        if (
            entry.outputEnabled === false ||
            entry.args.operation !== 'laser-raster'
        )
            continue;
        const source = entry.args.loops.find((l) => (l as ViewLoop).bitmapId) as
            | ViewLoop
            | undefined;
        const bitmap = bitmaps.find((b) => b.id === source?.bitmapId);
        const ids = entry.args.laserOptions?.maskSourceIds ?? [];
        if (!ids.length && !bitmap?.maskSourceIds?.length) continue;
        try {
            validateImageMaskSources(ids);
            if (
                !bitmap ||
                !source ||
                JSON.stringify(
                    loops.find((l) => l.id === source.id)?.points,
                ) !== JSON.stringify(source.points) ||
                JSON.stringify(ids) !==
                    JSON.stringify(bitmap.maskSourceIds ?? [])
            )
                throw new Error(
                    'Linked mask changed. Regenerate its raster toolpath.',
                );
            let currentMask = currentMasks.get(bitmap.id);
            if (currentMask === undefined) {
                currentMask = JSON.stringify(
                    resolveLinkedImageMask(bitmap, loops),
                );
                currentMasks.set(bitmap.id, currentMask);
            }
            if (
                currentMask !==
                JSON.stringify(entry.args.laserOptions?.imageMask ?? [])
            )
                throw new Error(
                    'Linked mask changed. Regenerate its raster toolpath.',
                );
        } catch (e) {
            return `${entry.label}: ${(e as Error).message}`;
        }
    }
    return '';
}
