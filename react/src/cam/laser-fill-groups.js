import {
    clipperPathFromPoints,
    ensurePositiveOrientation,
    ensureNegativeOrientation,
    groupCompositePolygons,
} from './geometry/polygons.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import { CLIPPER_SCALE } from '../engine/constants.js';

/** Sequence already-unioned filled islands; holes and overlapping artwork must not engrave twice. */
export function artworkFillGroups(composite, records) {
    for (const record of records)
        for (const { loop } of record.sources)
            if (
                loop.groupId !== undefined &&
                (typeof loop.groupId !== 'string' ||
                    !loop.groupId.length ||
                    loop.groupId.length > 512)
            )
                throw new Error('Invalid artwork group.');
    const islands = groupCompositePolygons(composite);
    if (islands.length < 2) return islands;
    const paths = islands.map((polys) => polys.map(clipperPathFromPoints));
    const sizes = paths.map((polys) => polys.reduce((n, p) => n + p.length, 0));
    const holes = new Map();
    for (const record of records)
        if (record.parent) {
            const children = holes.get(record.parent) ?? [];
            children.push(record);
            holes.set(record.parent, children);
        }
    const bounds = islands.map((polys) => boundsOfPoints(polys[0]));
    const parents = islands.map((_, i) => i),
        ranks = islands.map(() => Infinity);
    const root = (i) => {
        while (parents[i] !== i) {
            parents[i] = parents[parents[i]];
            i = parents[i];
        }
        return i;
    };
    const join = (a, b) => {
        parents[root(b)] = root(a);
    };
    const groups = new Map();
    let comparisons = 0,
        vertices = 0;
    for (const record of records) {
        if (record.depth % 2) continue;
        const source = [
            ensurePositiveOrientation(record.points),
            ...(holes.get(record) ?? []).map((r) =>
                ensureNegativeOrientation(r.points),
            ),
        ].map(clipperPathFromPoints);
        const sourceSize = source.reduce((n, p) => n + p.length, 0);
        const aliases = record.sources.map(({ loop, index }) => {
            return {
                key:
                    loop.groupId === undefined
                        ? `shape:${index}`
                        : `group:${loop.groupId}`,
                rank: index,
            };
        });
        for (let i = 0; i < islands.length; i++) {
            if (++comparisons > 4000000)
                throw new Error(
                    'Too many fill groups. Split this operation into smaller selections.',
                );
            const a = record.bounds,
                b = bounds[i];
            if (
                a.maxX <= b.minX ||
                b.maxX <= a.minX ||
                a.maxY <= b.minY ||
                b.maxY <= a.minY
            )
                continue;
            vertices += sourceSize + sizes[i];
            if (vertices > 20000000)
                throw new Error(
                    'Fill group geometry is too complex. Split this operation into smaller selections.',
                );
            const clipper = new ClipperLib.Clipper(),
                result = new ClipperLib.Paths();
            clipper.AddPaths(source, ClipperLib.PolyType.ptSubject, true);
            clipper.AddPaths(paths[i], ClipperLib.PolyType.ptClip, true);
            clipper.Execute(
                ClipperLib.ClipType.ctIntersection,
                result,
                ClipperLib.PolyFillType.pftNonZero,
                ClipperLib.PolyFillType.pftNonZero,
            );
            if (
                !result.some(
                    (path) =>
                        Math.abs(ClipperLib.Clipper.Area(path)) >
                        1e-8 * CLIPPER_SCALE ** 2,
                )
            )
                continue;
            for (const { key, rank } of aliases) {
                ranks[i] = Math.min(ranks[i], rank);
                if (groups.has(key)) join(i, groups.get(key));
                else groups.set(key, i);
            }
        }
    }
    const batches = new Map();
    islands.forEach((island, i) => {
        const key = root(i),
            batch = batches.get(key) ?? {
                rank: Infinity,
                first: i,
                polygons: [],
            };
        batch.rank = Math.min(batch.rank, ranks[i]);
        batch.polygons.push(...island);
        batches.set(key, batch);
    });
    return [...batches.values()]
        .sort((a, b) => a.rank - b.rank || a.first - b.first)
        .map((b) => b.polygons);
}
