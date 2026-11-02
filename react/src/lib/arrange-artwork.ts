import type { ViewLoop } from '../canvas/types';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import { assertArtworkSourcesUnchanged } from './vector-bitmap-document';

export const LAYOUT_ACTIONS = {
    left: 'Align left',
    centerX: 'Align horizontal centres',
    right: 'Align right',
    bottom: 'Align bottom',
    centerY: 'Align vertical centres',
    top: 'Align top',
    spaceX: 'Equal horizontal gaps',
    spaceY: 'Equal vertical gaps',
    centresX: 'Equal horizontal centre spacing',
    centresY: 'Equal vertical centre spacing',
    packX: 'Bring horizontal edges together',
    packY: 'Bring vertical edges together',
} as const;
export type LayoutAction = keyof typeof LAYOUT_ACTIONS;
export type LayoutSource = {
    shapes: ViewLoop[];
    bitmaps: (Pick<
        PlacedBitmapRecord,
        'id' | 'x' | 'y' | 'w' | 'h' | 'rotation'
    > & { dataUrl?: string })[];
    order: string[];
};
export function arrangeArtwork(source: LayoutSource, action: LayoutAction) {
    if (
        !Object.prototype.hasOwnProperty.call(LAYOUT_ACTIONS, action) ||
        source.shapes.length > 10000
    )
        throw new Error('Invalid arrangement settings.');
    const units = new Map<
        string,
        {
            shapes: ViewLoop[];
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
            rank: number;
            dx: number;
            dy: number;
        }
    >();
    const order = new Map(source.order.map((id, i) => [id, i]));
    let points = 0;
    const ids = new Set<string>();
    for (const shape of source.shapes) {
        if (
            typeof shape.id !== 'string' ||
            !shape.id ||
            (shape.groupId !== undefined &&
                typeof shape.groupId !== 'string') ||
            ids.has(shape.id) ||
            !Array.isArray(shape.points) ||
            !shape.points.length
        )
            throw new Error('Invalid selected geometry.');
        ids.add(shape.id);
        const key = shape.groupId
            ? `group:${shape.groupId}`
            : `shape:${shape.id}`;
        const unit = units.get(key) ?? {
            shapes: [],
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
            rank: -1,
            dx: 0,
            dy: 0,
        };
        unit.rank = Math.max(unit.rank, order.get(shape.id) ?? -1);
        for (const p of shape.points) {
            if (
                ++points > 1000000 ||
                ![p.x, p.y].every(Number.isFinite) ||
                Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000
            )
                throw new Error(
                    'Selected geometry is too detailed or has invalid coordinates.',
                );
            unit.minX = Math.min(unit.minX, p.x);
            unit.minY = Math.min(unit.minY, p.y);
            unit.maxX = Math.max(unit.maxX, p.x);
            unit.maxY = Math.max(unit.maxY, p.y);
        }
        unit.shapes.push(shape);
        units.set(key, unit);
    }
    const list = [...units.values()];
    if (list.length < 2)
        throw new Error('Select at least two separate shapes or groups.');
    const anchor = list.reduce((a, b) => (b.rank > a.rank ? b : a));
    const horizontal = [
        'left',
        'centerX',
        'right',
        'spaceX',
        'centresX',
        'packX',
    ].includes(action);
    const minimum = horizontal ? 'minX' : 'minY',
        maximum = horizontal ? 'maxX' : 'maxY',
        delta = horizontal ? 'dx' : 'dy';
    const centre = (u: typeof anchor) => (u[minimum] + u[maximum]) / 2;
    if (
        action.startsWith('space') ||
        action.startsWith('centres') ||
        action.startsWith('pack')
    ) {
        const centered = action.startsWith('centres');
        if (!action.startsWith('pack') && list.length < 3)
            throw new Error(
                'Select at least three separate shapes or groups to distribute.',
            );
        list.sort(
            (a, b) =>
                (centered ? centre(a) - centre(b) : a[minimum] - b[minimum]) ||
                a.rank - b.rank,
        );
        const first = list[0],
            last = list[list.length - 1];
        if (centered) {
            const step = (centre(last) - centre(first)) / (list.length - 1);
            list.forEach((u, i) => {
                u[delta] = centre(first) + i * step - centre(u);
            });
        } else {
            const gap = action.startsWith('pack')
                ? 0
                : (last[maximum] -
                      first[minimum] -
                      list.reduce((n, u) => n + u[maximum] - u[minimum], 0)) /
                  (list.length - 1);
            let cursor = first[minimum];
            for (const u of list) {
                u[delta] = cursor - u[minimum];
                cursor += u[maximum] - u[minimum] + gap;
            }
            if (action.startsWith('pack')) {
                const shift = anchor[delta];
                for (const u of list) u[delta] -= shift;
            }
        }
        if (!action.startsWith('pack')) first[delta] = last[delta] = 0;
    } else {
        const position = (u: typeof anchor) =>
            action.startsWith('center')
                ? centre(u)
                : ['left', 'bottom'].includes(action)
                  ? u[minimum]
                  : u[maximum];
        for (const u of list) u[delta] = position(anchor) - position(u);
    }
    const moves = new Map(
        list.flatMap((u) => u.shapes.map((s) => [s.id, u] as const)),
    );
    const bitmapMoves = new Map<string, typeof anchor>();
    const bitmapIds = new Set(source.bitmaps.map((b) => b.id));
    const changedIds: string[] = [];
    const shapes = source.shapes.map((shape) => {
        const move = moves.get(shape.id)!;
        if (shape.bitmapId) {
            const previous = bitmapMoves.get(shape.bitmapId);
            if (
                previous &&
                (previous.dx !== move.dx || previous.dy !== move.dy)
            )
                throw new Error(
                    'The same image cannot be arranged through separate shapes.',
                );
            bitmapMoves.set(shape.bitmapId, move);
            if (!bitmapIds.has(shape.bitmapId))
                throw new Error('Selected image is missing.');
        }
        if (!move.dx && !move.dy) return shape;
        changedIds.push(shape.id);
        const geometry = shape.exportGeometry as
            | { type?: string; cx?: number; cy?: number }
            | undefined;
        const translated = shape.points.map((p) => ({
            x: p.x + move.dx,
            y: p.y + move.dy,
        }));
        if (
            translated.some(
                (p) =>
                    ![p.x, p.y].every(Number.isFinite) ||
                    Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000,
            )
        )
            throw new Error('Arrangement exceeds supported coordinate limits.');
        return {
            ...shape,
            points: translated,
            bounds: undefined,
            path2d: null,
            segments: undefined,
            exportGeometry:
                geometry?.type === 'circle' &&
                Number.isFinite(geometry.cx) &&
                Number.isFinite(geometry.cy)
                    ? {
                          ...geometry,
                          cx: geometry.cx! + move.dx,
                          cy: geometry.cy! + move.dy,
                      }
                    : undefined,
        };
    });
    const bitmaps = source.bitmaps.map((b) => {
        const move = bitmapMoves.get(b.id);
        if (!move || (!move.dx && !move.dy)) return b;
        if (
            ![b.x, b.y, b.w, b.h, b.rotation ?? 0].every(Number.isFinite) ||
            b.w <= 0 ||
            b.h <= 0
        )
            throw new Error('Invalid selected image placement.');
        if (
            Math.max(Math.abs(b.x + move.dx), Math.abs(b.y + move.dy)) > 1000000
        )
            throw new Error('Arrangement exceeds supported coordinate limits.');
        return { ...b, x: b.x + move.dx, y: b.y + move.dy };
    });
    return {
        shapes,
        bitmaps,
        changedIds,
        movedUnits: list.filter((u) => u.dx || u.dy).length,
        units: list.length,
    };
}
export type LayoutResult = ReturnType<typeof arrangeArtwork>;
export function assertLayoutSourcesUnchanged(
    loops: ViewLoop[],
    bitmaps: PlacedBitmapRecord[],
    source: LayoutSource,
) {
    assertArtworkSourcesUnchanged(loops, source.shapes);
    const current = new Map(bitmaps.map((b) => [b.id, b]));
    if (
        source.bitmaps.some((b) => {
            const latest = current.get(b.id);
            return (
                !latest ||
                (['x', 'y', 'w', 'h', 'rotation', 'dataUrl'] as const).some(
                    (key) => latest[key] !== b[key],
                )
            );
        })
    )
        throw new Error('Source images changed. Close and reopen Arrange.');
    const groups = new Set(
            source.shapes.flatMap((s) => (s.groupId ? [s.groupId] : [])),
        ),
        captured = new Set(source.shapes.map((s) => s.id));
    if (
        loops.some(
            (s) => s.groupId && groups.has(s.groupId) && !captured.has(s.id),
        )
    )
        throw new Error('Source groups changed. Close and reopen Arrange.');
}
