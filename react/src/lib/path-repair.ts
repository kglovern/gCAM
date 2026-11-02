import { duplicateShapes } from './duplicate-shapes';
import { simplifyPath } from './simplify-path';
import type { ViewLoop } from '../canvas/types';
type Point = { x: number; y: number };
export const isOpenShape = (shape: ViewLoop) =>
    !shape.bitmapId &&
    shape.points.length >= 2 &&
    Math.hypot(
        shape.points[0].x - shape.points[shape.points.length - 1].x,
        shape.points[0].y - shape.points[shape.points.length - 1].y,
    ) > 1e-7;
export type PathRepairRequest = {
    shapes: ViewLoop[];
    mode: 'join' | 'close' | 'duplicates' | 'simplify';
    acrossLayers?: boolean;
    tolerance: number;
    closure: 'line' | 'move';
};
const midpoint = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
});
const edited = (shape: ViewLoop, points: Point[]): ViewLoop => ({
    id: shape.id,
    points,
    ...(shape.groupId ? { groupId: shape.groupId } : {}),
    ...(shape.layerId ? { layerId: shape.layerId } : {}),
    ...(shape.layerColor ? { layerColor: shape.layerColor } : {}),
});
export function repairPaths({
    shapes,
    mode,
    tolerance,
    closure,
    acrossLayers = false,
}: PathRepairRequest) {
    if (
        !Array.isArray(shapes) ||
        shapes.length > (mode === 'duplicates' ? 100000 : 10000) ||
        !Number.isFinite(tolerance) ||
        tolerance < 0.000001 ||
        tolerance > 1000 ||
        !['join', 'close', 'duplicates', 'simplify'].includes(mode) ||
        typeof acrossLayers !== 'boolean' ||
        !['line', 'move'].includes(closure)
    )
        throw new Error('Invalid path repair settings.');
    let pointsCount = 0;
    for (const shape of shapes) {
        if (!Array.isArray(shape.points))
            throw new Error('Invalid source shape.');
        pointsCount += shape.points.length;
        if (
            pointsCount > 1000000 ||
            shape.points.some(
                (p) =>
                    ![p.x, p.y].every(Number.isFinite) ||
                    Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000,
            )
        )
            throw new Error(
                'Selection is too complex or has invalid coordinates.',
            );
    }
    if (mode === 'duplicates')
        return {
            ...duplicateShapes(shapes, acrossLayers),
            pointsBefore: pointsCount,
            pointsAfter: pointsCount,
        };
    const open = shapes.filter(isOpenShape),
        changedIds: string[] = [],
        replacements = new Map<string, ViewLoop>(),
        removed = new Set<string>();
    let joined = 0,
        closed = 0,
        ambiguous = 0;
    if (mode === 'simplify') {
        let work = 0;
        for (const shape of shapes) {
            if (shape.bitmapId) continue;
            const points = simplifyPath(shape.points, tolerance, () => {
                if (++work > 20000000)
                    throw new Error(
                        'Path fitting is too complex. Select fewer shapes or increase tolerance.',
                    );
            });
            if (points !== shape.points) {
                replacements.set(shape.id, edited(shape, points));
                changedIds.push(shape.id);
            }
        }
    } else if (mode === 'close') {
        for (const shape of open) {
            const p = shape.points,
                first = p[0],
                last = p[p.length - 1];
            if (
                p.length < (closure === 'move' ? 4 : 3) ||
                Math.hypot(first.x - last.x, first.y - last.y) > tolerance
            )
                continue;
            const points = p.map((p) => ({ ...p }));
            if (closure === 'line') points.push({ ...first });
            else {
                const middle = midpoint(first, last);
                points[0] = middle;
                points[points.length - 1] = { ...middle };
            }
            replacements.set(shape.id, edited(shape, points));
            changedIds.push(shape.id);
            closed++;
        }
    } else {
        const endpoints = open.flatMap((s) => [
            s.points[0],
            s.points[s.points.length - 1],
        ]);
        const partitions = open.map((s) =>
            JSON.stringify([
                s.groupId ?? '',
                s.layerId ?? '',
                s.layerColor ?? '',
            ]),
        );
        const grid = new Map<string, number[]>();
        const key = (x: number, y: number, i: number) =>
            `${partitions[Math.floor(i / 2)]}:${x}:${y}`;
        endpoints.forEach((p, i) => {
            const k = key(
                Math.floor(p.x / tolerance),
                Math.floor(p.y / tolerance),
                i,
            );
            const cell = grid.get(k) ?? [];
            cell.push(i);
            grid.set(k, cell);
        });
        const candidates = new Int32Array(endpoints.length).fill(-1),
            counts = new Uint32Array(endpoints.length);
        let checks = 0;
        endpoints.forEach((p, i) => {
            const x = Math.floor(p.x / tolerance),
                y = Math.floor(p.y / tolerance);
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    for (const j of grid.get(key(x + dx, y + dy, i)) ?? []) {
                        if (++checks > 2000000)
                            throw new Error(
                                'Too many nearby endpoints; select a smaller area or reduce tolerance.',
                            );
                        if (
                            i === j ||
                            (Math.floor(i / 2) === Math.floor(j / 2) &&
                                open[Math.floor(i / 2)].points.length < 4)
                        )
                            continue;
                        if (
                            Math.hypot(
                                p.x - endpoints[j].x,
                                p.y - endpoints[j].y,
                            ) <= tolerance
                        ) {
                            counts[i]++;
                            candidates[i] = j;
                        }
                    }
        });
        const links = candidates.map((j, i) =>
            counts[i] === 1 && counts[j] === 1 && candidates[j] === i ? j : -1,
        );
        ambiguous = Array.from(counts).filter((n) => n > 1).length;
        const visited = new Set<number>();
        for (let root = 0; root < open.length; root++) {
            if (visited.has(root)) continue;
            const component: number[] = [],
                pending = [root],
                found = new Set<number>();
            while (pending.length) {
                const i = pending.pop()!;
                if (found.has(i)) continue;
                found.add(i);
                component.push(i);
                for (const e of [2 * i, 2 * i + 1])
                    if (links[e] >= 0) pending.push(Math.floor(links[e] / 2));
            }
            component.sort((a, b) => a - b);
            const boundary = component.find(
                (i) => links[2 * i] < 0 || links[2 * i + 1] < 0,
            );
            let index = boundary ?? component[0],
                side = links[2 * index] < 0 ? 0 : 1;
            const output: Point[] = [];
            while (!visited.has(index)) {
                visited.add(index);
                const points = open[index].points.map((p) => ({ ...p }));
                if (side === 1) points.reverse();
                const entry = 2 * index + side,
                    exit = 2 * index + 1 - side;
                if (links[entry] >= 0)
                    points[0] = midpoint(
                        endpoints[entry],
                        endpoints[links[entry]],
                    );
                if (links[exit] >= 0)
                    points[points.length - 1] = midpoint(
                        endpoints[exit],
                        endpoints[links[exit]],
                    );
                for (let k = output.length ? 1 : 0; k < points.length; k++)
                    output.push(points[k]);
                if (links[exit] < 0) break;
                const next = links[exit];
                index = Math.floor(next / 2);
                side = next % 2;
                if (visited.has(index))
                    output[output.length - 1] = { ...output[0] };
            }
            const anchor = open[component[0]];
            const changed =
                component.length > 1 || links[2 * component[0]] >= 0;
            if (!changed) continue;
            if (!isOpenShape({ ...anchor, points: output })) {
                const a = output[0],
                    b = output.find(
                        (p) => Math.hypot(p.x - a.x, p.y - a.y) > 1e-7,
                    );
                // Duplicate straight segments must not become a zero-area closed shape.
                if (
                    !b ||
                    !output.some(
                        (p) =>
                            Math.abs(
                                (b.x - a.x) * (p.y - a.y) -
                                    (b.y - a.y) * (p.x - a.x),
                            ) > 1e-12,
                    )
                )
                    continue;
            }
            replacements.set(anchor.id, edited(anchor, output));
            for (const i of component) {
                changedIds.push(open[i].id);
                if (i !== component[0]) removed.add(open[i].id);
            }
            joined += component.length - 1;
            if (!isOpenShape({ ...anchor, points: output })) closed++;
        }
    }
    const result = shapes.flatMap((s) =>
        removed.has(s.id) ? [] : [replacements.get(s.id) ?? s],
    );
    return {
        shapes: result,
        changedIds,
        found: open.length,
        joined,
        closed,
        remaining: result.filter(isOpenShape).length,
        ambiguous,
        duplicates: 0,
        duplicateKeepIds: [] as string[],
        scanned: shapes.length,
        skipped: 0,
        pointsBefore: pointsCount,
        pointsAfter: result.reduce((n, shape) => n + shape.points.length, 0),
    };
}
export type PathRepairResult = ReturnType<typeof repairPaths>;
