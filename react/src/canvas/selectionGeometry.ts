import {
    findCornerIntersection,
    type CornerIntersection,
} from '../lib/cornerIntersections';
/**
 * Purpose: Implementation module for selectionGeometry in the canvas domain.
 */
import { nearestPointOnPolyline } from '../cam/cam-ops.js';
import { findGuideIntersection, snapToGuides, type Guide } from '../lib/guides';
import {
    rotatePoints,
    scalePoints,
    translatePoints,
    type TransformMode,
} from '../lib/transform';

export interface CanvasLoopGeometry {
    id: string;
    points: { x: number; y: number }[];
    bitmapId?: string;
    sourceType?: string;
    radius?: number;
    exportGeometry?: {
        type?: string;
        cx?: number;
        cy?: number;
        radius?: number;
        segments?: {
            kind?: string;
            start?: { x: number; y: number };
            end?: { x: number; y: number };
            cx?: number;
            cy?: number;
            radius?: number;
            startAngle?: number;
            endAngle?: number;
            clockwise?: boolean;
        }[];
    };
}

export type DrawSnapKind =
    | 'endpoint'
    | 'midpoint'
    | 'edge'
    | 'origin'
    | 'guide'
    | 'guide-intersection'
    | 'x-axis'
    | 'y-axis'
    | 'grid';

export interface DrawSnapTarget {
    point: { x: number; y: number };
    kind: DrawSnapKind;
    label: string;
    distancePx: number;
}

export interface LoopHoverTarget {
    loopId: string;
    segmentIndex: number;
    distance: number;
}

export interface SelectionFrame {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface TransformDragState {
    mode: 'move' | 'scale' | 'rotate';
    startWorld: { x: number; y: number };
    orig: { id: string; points: { x: number; y: number }[] }[];
    center: { x: number; y: number };
    anchor: { x: number; y: number };
    moved: boolean;
    dx: number;
    dy: number;
    deg: number;
    factor: number;
}

export interface CornerHover {
    intersection?: CornerIntersection;
    loopId: string;
    index: number;
    point: { x: number; y: number };
}

export function findFilletCorner(
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    intersections = true,
): CornerHover | null {
    const allowed = selected.length ? new Set(selected) : null;
    const tolerance = 10 / Math.max(scale, 0.01);
    let best: (CornerHover & { distance: number }) | null = null;
    for (const loop of loops) {
        if (
            hidden.includes(loop.id) ||
            loop.bitmapId ||
            (allowed && !allowed.has(loop.id))
        )
            continue;
        const lastPoint = loop.points[loop.points.length - 1];
        const closed =
            loop.points.length > 1 &&
            loop.points[0].x === lastPoint.x &&
            loop.points[0].y === lastPoint.y;
        const first = closed ? 0 : 1;
        for (let index = first; index <= loop.points.length - 2; index += 1) {
            const point = loop.points[index];
            const distance = Math.hypot(point.x - world.x, point.y - world.y);
            if (distance <= tolerance && (!best || distance < best.distance)) {
                best = { loopId: loop.id, index, point, distance };
            }
        }
    }
    const crossing = intersections
        ? findCornerIntersection(loops, selected, hidden, world, tolerance)
        : null;
    if (
        crossing &&
        (!best ||
            Math.hypot(
                crossing.point.x - world.x,
                crossing.point.y - world.y,
            ) <= best.distance)
    )
        return {
            loopId: crossing.loopIds[0],
            index: -1,
            point: crossing.point,
            intersection: crossing,
        };
    return best;
}

export function selectionFrame(
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
): SelectionFrame | null {
    const hiddenIds = new Set(hidden);
    const points = loops
        .filter((loop) => selected.includes(loop.id) && !hiddenIds.has(loop.id))
        .flatMap((loop) => loop.points);
    if (!points.length) return null;
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}

export function applyDragPreview(
    original: TransformDragState['orig'],
    drag: TransformDragState,
): { x: number; y: number }[][] {
    return original.map((loop) => {
        if (drag.mode === 'move')
            return translatePoints(loop.points, drag.dx, drag.dy);
        if (drag.mode === 'rotate')
            return rotatePoints(loop.points, drag.deg, drag.center);
        return scalePoints(loop.points, drag.factor, drag.anchor);
    });
}

export function findDrawSnapTarget(
    loops: CanvasLoopGeometry[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    grid: { snap: boolean; spacingMm: number } | null = null,
    guides: Guide[] = [],
): DrawSnapTarget | null {
    const hiddenIds = new Set(hidden);
    const safeScale = Math.max(scale, 0.01);
    const tolerancePx = 12;
    const visible = loops.filter(
        (loop) =>
            !hiddenIds.has(loop.id) &&
            !loop.bitmapId &&
            loop.points.length >= 2,
    );
    const bestPoint = (
        points: { point: { x: number; y: number }; label: string }[],
        kind: DrawSnapKind,
    ): DrawSnapTarget | null => {
        let best: DrawSnapTarget | null = null;
        for (const candidate of points) {
            const distancePx =
                Math.hypot(
                    candidate.point.x - world.x,
                    candidate.point.y - world.y,
                ) * safeScale;
            if (
                distancePx <= tolerancePx &&
                (!best || distancePx < best.distancePx)
            )
                best = { ...candidate, kind, distancePx };
        }
        return best;
    };

    // Geometry landmarks outrank every continuous snap target.
    const endpoints: { point: { x: number; y: number }; label: string }[] = [];
    const midpoints: typeof endpoints = [];
    for (const loop of visible) {
        const circle =
            loop.exportGeometry?.type === 'circle' ||
            loop.sourceType === 'circle';
        if (circle) {
            const cx = loop.exportGeometry?.cx;
            const cy = loop.exportGeometry?.cy;
            const radius = loop.exportGeometry?.radius ?? loop.radius;
            if (
                Number.isFinite(cx) &&
                Number.isFinite(cy) &&
                Number.isFinite(radius)
            ) {
                for (const [x, y] of [
                    [cx! + radius!, cy!],
                    [cx!, cy! + radius!],
                    [cx! - radius!, cy!],
                    [cx!, cy! - radius!],
                ])
                    endpoints.push({ point: { x, y }, label: 'Quadrant' });
            }
            continue;
        }
        const segments = loop.exportGeometry?.segments?.filter(
            (segment) => segment.kind === 'line' || segment.kind === 'arc',
        );
        if (segments?.length) {
            for (const segment of segments) {
                if (segment.start)
                    endpoints.push({ point: segment.start, label: 'Endpoint' });
                if (segment.end)
                    endpoints.push({ point: segment.end, label: 'Endpoint' });
                if (segment.kind === 'line' && segment.start && segment.end) {
                    midpoints.push({
                        point: {
                            x: (segment.start.x + segment.end.x) / 2,
                            y: (segment.start.y + segment.end.y) / 2,
                        },
                        label: 'Midpoint',
                    });
                } else if (
                    segment.kind === 'arc' &&
                    Number.isFinite(segment.cx) &&
                    Number.isFinite(segment.cy) &&
                    Number.isFinite(segment.radius) &&
                    Number.isFinite(segment.startAngle) &&
                    Number.isFinite(segment.endAngle)
                ) {
                    const sweep = segment.clockwise
                        ? segment.startAngle! - segment.endAngle!
                        : segment.endAngle! - segment.startAngle!;
                    const angle =
                        segment.startAngle! +
                        (sweep / 2) * (segment.clockwise ? -1 : 1);
                    midpoints.push({
                        point: {
                            x: segment.cx! + Math.cos(angle) * segment.radius!,
                            y: segment.cy! + Math.sin(angle) * segment.radius!,
                        },
                        label: 'Midpoint',
                    });
                }
            }
            continue;
        }
        const points = loop.points;
        const isClosed =
            points.length > 2 &&
            Math.hypot(
                points[0].x - points[points.length - 1].x,
                points[0].y - points[points.length - 1].y,
            ) < 1e-7;
        const count = isClosed ? points.length - 1 : points.length;
        for (let index = 0; index < count; index += 1) {
            const point = points[index];
            endpoints.push({ point, label: isClosed ? 'Vertex' : 'Endpoint' });
            const next = points[(index + 1) % count];
            if (
                next &&
                loop.sourceType !== 'arc' &&
                loop.sourceType !== 'bezier'
            )
                midpoints.push({
                    point: {
                        x: (point.x + next.x) / 2,
                        y: (point.y + next.y) / 2,
                    },
                    label: 'Midpoint',
                });
        }
    }
    const endpoint = bestPoint(endpoints, 'endpoint');
    if (endpoint) return endpoint;
    const midpoint = bestPoint(midpoints, 'midpoint');
    if (midpoint) return midpoint;

    // Snap to the nearest point on actual rendered vector edges. This is a
    // screen-space hit test, so the acquisition width stays comfortable at any zoom.
    let nearestEdge: DrawSnapTarget | null = null;
    for (const loop of visible) {
        const circle =
            loop.exportGeometry?.type === 'circle' ||
            loop.sourceType === 'circle';
        const cx = loop.exportGeometry?.cx;
        const cy = loop.exportGeometry?.cy;
        const radius = loop.exportGeometry?.radius ?? loop.radius;
        if (
            circle &&
            Number.isFinite(cx) &&
            Number.isFinite(cy) &&
            Number.isFinite(radius)
        ) {
            const dx = world.x - cx!;
            const dy = world.y - cy!;
            const distance = Math.hypot(dx, dy) || 1;
            const point = {
                x: cx! + (dx / distance) * radius!,
                y: cy! + (dy / distance) * radius!,
            };
            const distancePx = Math.abs(distance - radius!) * safeScale;
            if (
                distancePx <= tolerancePx &&
                (!nearestEdge || distancePx < nearestEdge.distancePx)
            )
                nearestEdge = {
                    point,
                    kind: 'edge',
                    label: 'On shape',
                    distancePx,
                };
            continue;
        }
        const points = loop.points;
        for (let index = 0; index < points.length - 1; index += 1) {
            const a = points[index];
            const b = points[index + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSquared = dx * dx + dy * dy;
            if (lengthSquared < 1e-12) continue;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((world.x - a.x) * dx + (world.y - a.y) * dy) /
                        lengthSquared,
                ),
            );
            const point = { x: a.x + dx * t, y: a.y + dy * t };
            const distancePx =
                Math.hypot(point.x - world.x, point.y - world.y) * safeScale;
            if (
                distancePx <= tolerancePx &&
                (!nearestEdge || distancePx < nearestEdge.distancePx)
            )
                nearestEdge = {
                    point,
                    kind: 'edge',
                    label: 'On shape',
                    distancePx,
                };
        }
    }
    if (nearestEdge) return nearestEdge;

    const tolerance = tolerancePx / safeScale;
    const originDistance = Math.hypot(world.x, world.y) * safeScale;
    if (originDistance <= tolerancePx)
        return {
            point: { x: 0, y: 0 },
            kind: 'origin',
            label: 'Origin',
            distancePx: originDistance,
        };
    const guideIntersection = findGuideIntersection(
        world,
        guides,
        safeScale,
        tolerancePx,
    );
    if (guideIntersection)
        return {
            ...guideIntersection,
            kind: 'guide-intersection',
            label: 'Guide intersection',
        };
    const guideSnap = snapToGuides(world, guides, tolerance);
    if (guideSnap.x !== world.x || guideSnap.y !== world.y)
        return {
            point: guideSnap,
            kind: 'guide',
            label: 'Guide',
            distancePx:
                Math.hypot(guideSnap.x - world.x, guideSnap.y - world.y) *
                safeScale,
        };
    const axisCandidates = [
        {
            point: { x: world.x, y: 0 },
            kind: 'x-axis' as const,
            label: 'X axis',
        },
        {
            point: { x: 0, y: world.y },
            kind: 'y-axis' as const,
            label: 'Y axis',
        },
    ]
        .map((candidate) => ({
            ...candidate,
            distancePx:
                Math.hypot(
                    candidate.point.x - world.x,
                    candidate.point.y - world.y,
                ) * safeScale,
        }))
        .filter((candidate) => candidate.distancePx <= tolerancePx)
        .sort((a, b) => a.distancePx - b.distancePx);
    if (axisCandidates[0]) return axisCandidates[0];
    if (grid?.snap && grid.spacingMm > 0) {
        const point = {
            x: Math.round(world.x / grid.spacingMm) * grid.spacingMm,
            y: Math.round(world.y / grid.spacingMm) * grid.spacingMm,
        };
        return {
            point,
            kind: 'grid',
            label: 'Grid',
            distancePx:
                Math.hypot(point.x - world.x, point.y - world.y) * safeScale,
        };
    }
    return null;
}

export function findLoopAtPoint(
    loops: CanvasLoopGeometry[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    hitRadiusPx = 10,
): LoopHoverTarget | null {
    const tolerance = hitRadiusPx / Math.max(scale, 0.01);
    const hiddenIds = new Set(hidden);
    let nearest: LoopHoverTarget | null = null;
    for (const loop of loops) {
        if (hiddenIds.has(loop.id) || loop.points.length < 2) continue;
        let segmentIndex = -1;
        let distance = Infinity;
        for (let index = 0; index < loop.points.length - 1; index += 1) {
            const start = loop.points[index];
            const end = loop.points[index + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            if (lengthSquared < 1e-12) continue;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((world.x - start.x) * dx + (world.y - start.y) * dy) /
                        lengthSquared,
                ),
            );
            const nextDistance = Math.hypot(
                start.x + dx * t - world.x,
                start.y + dy * t - world.y,
            );
            if (nextDistance < distance) {
                distance = nextDistance;
                segmentIndex = index;
            }
        }
        if (
            segmentIndex >= 0 &&
            distance <= tolerance &&
            (!nearest || distance < nearest.distance)
        )
            nearest = {
                loopId: loop.id,
                segmentIndex,
                distance,
            };
    }
    return nearest;
}

export function snapDrawPoint(
    loops: CanvasLoopGeometry[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    grid: { snap: boolean; spacingMm: number } | null = null,
    guides: Guide[] = [],
): { x: number; y: number } {
    return (
        findDrawSnapTarget(loops, hidden, world, scale, grid, guides)?.point ??
        world
    );
}

export function constrainDrawAngle(
    point: { x: number; y: number },
    anchor: { x: number; y: number },
    incrementDegrees = 15,
): { x: number; y: number } {
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    const increment = (incrementDegrees * Math.PI) / 180;
    const angle = Math.round(Math.atan2(dy, dx) / increment) * increment;
    return {
        x: anchor.x + Math.cos(angle) * distance,
        y: anchor.y + Math.sin(angle) * distance,
    };
}

export function hitTransformTarget(
    mode: TransformMode,
    frame: SelectionFrame,
    toScreen: (x: number, y: number) => { x: number; y: number },
    sx: number,
    sy: number,
    world: { x: number; y: number },
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
    scale: number,
): { kind: 'move' | 'scale' | 'rotate'; key: string; cursor: string } | null {
    const nw = toScreen(frame.minX, frame.maxY);
    const ne = toScreen(frame.maxX, frame.maxY);
    const se = toScreen(frame.maxX, frame.minY);
    const sw = toScreen(frame.minX, frame.minY);
    const cx = (nw.x + se.x) / 2;
    const cy = (nw.y + se.y) / 2;
    if (mode === 'scale' || mode === 'transform') {
        for (const [key, point] of [
            ['nw', nw],
            ['ne', ne],
            ['se', se],
            ['sw', sw],
        ] as const) {
            if (Math.hypot(sx - point.x, sy - point.y) <= 10) {
                return {
                    kind: 'scale',
                    key,
                    cursor:
                        key === 'ne' || key === 'sw'
                            ? 'nesw-resize'
                            : 'nwse-resize',
                };
            }
        }
        if (mode === 'scale') return null;
    }
    if (mode === 'rotate' || mode === 'transform') {
        for (const point of [nw, ne, se, sw]) {
            const dx = point.x - cx;
            const dy = point.y - cy;
            const length = Math.hypot(dx, dy) || 1;
            if (
                Math.hypot(
                    sx - (point.x + (dx / length) * 18),
                    sy - (point.y + (dy / length) * 18),
                ) <= 10
            )
                return { kind: 'rotate', key: '', cursor: 'grab' };
        }
        if (mode === 'rotate') return null;
    }
    if (
        sx >= Math.min(nw.x, se.x) - 2 &&
        sx <= Math.max(nw.x, se.x) + 2 &&
        sy >= Math.min(nw.y, se.y) - 2 &&
        sy <= Math.max(nw.y, se.y) + 2
    )
        return { kind: 'move', key: '', cursor: 'move' };
    const hiddenIds = new Set(hidden);
    for (const loop of loops) {
        if (
            !selected.includes(loop.id) ||
            hiddenIds.has(loop.id) ||
            loop.points.length < 2
        )
            continue;
        const nearest = nearestPointOnPolyline(loop.points, world);
        if (nearest && nearest.distance <= 12 / scale)
            return { kind: 'move', key: '', cursor: 'move' };
    }
    return null;
}
