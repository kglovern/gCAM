import { segmentCrossings } from './trim';
import { chamferCorner, filletCorner, type CornerPoint } from './corners';

export interface CornerIntersection {
    point: CornerPoint;
    first: CornerPoint;
    second: CornerPoint;
    loopIds: [string, string];
}

/** Use the pointer side of each line to choose the corner at a crossing. */
export function findCornerIntersection(
    loops: { id: string; points: CornerPoint[]; bitmapId?: string }[],
    selected: string[],
    hidden: string[],
    world: CornerPoint,
    tolerance: number,
): CornerIntersection | null {
    const segments = loops
        .filter(
            (loop) =>
                !loop.bitmapId &&
                !hidden.includes(loop.id) &&
                (!selected.length || selected.includes(loop.id)),
        )
        .flatMap((loop) =>
            loop.points
                .slice(1)
                .map((b, index) => ({ id: loop.id, a: loop.points[index], b })),
        )
        .filter(
            ({ a, b }) =>
                world.x >= Math.min(a.x, b.x) - tolerance &&
                world.x <= Math.max(a.x, b.x) + tolerance &&
                world.y >= Math.min(a.y, b.y) - tolerance &&
                world.y <= Math.max(a.y, b.y) + tolerance,
        );
    let best: CornerIntersection | null = null;
    let nearest = tolerance;
    const ray = (a: CornerPoint, b: CornerPoint, point: CornerPoint) =>
        [a, b]
            .filter((p) => Math.hypot(p.x - point.x, p.y - point.y) > 1e-8)
            .sort((p, q) => {
                const score = (v: CornerPoint) =>
                    ((v.x - point.x) * (world.x - point.x) +
                        (v.y - point.y) * (world.y - point.y)) /
                    Math.hypot(v.x - point.x, v.y - point.y);
                return score(q) - score(p);
            })[0];
    for (let i = 0; i < segments.length; i++)
        for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i],
                b = segments[j];
            if (a.id === b.id) continue;
            const cross =
                (a.b.x - a.a.x) * (b.b.y - b.a.y) -
                (a.b.y - a.a.y) * (b.b.x - b.a.x);
            const lengths =
                Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) *
                Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y);
            if (!lengths || Math.abs(cross) < 1e-10 * lengths) continue;
            const t = segmentCrossings(a.a, a.b, b.a, b.b)[0];
            if (t === undefined) continue;
            const point = {
                x: a.a.x + t * (a.b.x - a.a.x),
                y: a.a.y + t * (a.b.y - a.a.y),
            };
            const distance = Math.hypot(point.x - world.x, point.y - world.y);
            if (distance > nearest) continue;
            const first = ray(a.a, a.b, point),
                second = ray(b.a, b.b, point);
            if (!first || !second) continue;
            nearest = distance;
            best = { point, first, second, loopIds: [a.id, b.id] };
        }
    return best;
}

/** Return only the new connector; the original lines remain untouched. */
export function intersectionConnector(
    target: CornerIntersection,
    size: number,
    tool: 'fillet' | 'chamfer',
): CornerPoint[] | null {
    const path = [target.first, target.point, target.second];
    const result =
        tool === 'fillet'
            ? filletCorner(path, 1, size)
            : chamferCorner(path, 1, size);
    return result ? result.slice(1, -1) : null;
}
