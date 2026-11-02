/**
 * Purpose: Implementation module for polygons in the cam domain.
 */
import '../../engine/clipper-shim.js';
import { CLIPPER_SCALE } from '../../engine/constants.js';
import { closePoints, clonePoint } from '../../geometry/primitives.js';
import { boundsOfPoints, polygonArea } from '../../geometry/bounds.js';

export function clipperPathFromPoints(points) {
    const path = points.slice(0, -1).map((point) => ({
        X: Math.round(point.x * CLIPPER_SCALE),
        Y: Math.round(point.y * CLIPPER_SCALE),
    }));
    return ClipperLib.JS.Clean(path, 2);
}

export function pointsFromClipperPath(path) {
    const points = path.map((point) => ({
        x: point.X / CLIPPER_SCALE,
        y: point.Y / CLIPPER_SCALE,
    }));
    return closePoints(points);
}

export function ensurePositiveOrientation(points) {
    return polygonArea(points) < 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function ensureNegativeOrientation(points) {
    return polygonArea(points) > 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersects =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-12) + xi;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

export function polygonCentroid(points) {
    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const cross = a.x * b.y - b.x * a.y;
        signedArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }

    if (Math.abs(signedArea) < 1e-9) {
        return clonePoint(points[0]);
    }

    const scale = 1 / (3 * signedArea);
    return { x: cx * scale, y: cy * scale };
}

export function compositePocketGeometry(selectedLoops, minArea = 1) {
    const candidates = selectedLoops
        .map((loop, index) => {
            const points = closePoints(loop.points);
            return {
                points,
                path: clipperPathFromPoints(points),
                bounds: boundsOfPoints(points),
                area: Math.abs(polygonArea(points)),
                depth: 0,
                parent: null,
                sources: [{ loop, index }],
            };
        })
        .sort((a, b) => b.area - a.area);
    const difference = (a, b, operation) => {
        const clipper = new ClipperLib.Clipper(),
            result = new ClipperLib.Paths();
        clipper.AddPath(a.path, ClipperLib.PolyType.ptSubject, true);
        clipper.AddPath(b.path, ClipperLib.PolyType.ptClip, true);
        clipper.Execute(
            operation,
            result,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero,
        );
        return result.length;
    };
    const records = [],
        sameBounds = new Map();
    for (const record of candidates) {
        const box = record.bounds;
        const key = [box.minX, box.minY, box.maxX, box.maxY]
            .map((value) => Math.round(value * CLIPPER_SCALE))
            .join(',');
        const matches = sameBounds.get(key) ?? [];
        // Duplicate outlines must not change winding counts or erase enclosed holes.
        const duplicate = matches.find(
            (other) => !difference(record, other, ClipperLib.ClipType.ctXor),
        );
        if (duplicate) {
            duplicate.sources.push(...record.sources);
            continue;
        }
        matches.push(record);
        sameBounds.set(key, matches);
        records.push(record);
    }
    for (let i = 0; i < records.length; i++) {
        const record = records[i],
            b = record.bounds;
        // The smallest enclosing contour determines depth; a centroid can lie outside a concave shape.
        for (let j = i - 1; j >= 0; j--) {
            const candidate = records[j],
                a = candidate.bounds;
            if (
                candidate.area <= record.area ||
                b.minX < a.minX ||
                b.minY < a.minY ||
                b.maxX > a.maxX ||
                b.maxY > a.maxY
            )
                continue;
            if (
                !difference(record, candidate, ClipperLib.ClipType.ctDifference)
            ) {
                record.depth = candidate.depth + 1;
                record.parent = candidate;
                break;
            }
        }
    }

    const orientedPaths = records.map((record) =>
        record.depth % 2 === 0
            ? ensurePositiveOrientation(record.points)
            : ensureNegativeOrientation(record.points),
    );
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(
        orientedPaths.map(clipperPathFromPoints),
        ClipperLib.PolyType.ptSubject,
        true,
    );
    const solution = new ClipperLib.Paths();
    clipper.Execute(
        ClipperLib.ClipType.ctUnion,
        solution,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );
    const paths = solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > minArea);
    return { paths, records };
}

export function compositePocketSeedPaths(selectedLoops, minArea = 1) {
    return compositePocketGeometry(selectedLoops, minArea).paths;
}

export function offsetCompositePolygons(paths, delta, minArea = 1) {
    if (!paths.length) return [];
    const offsetter = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
    offsetter.AddPaths(
        paths.map(clipperPathFromPoints),
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etClosedPolygon,
    );
    const solution = new ClipperLib.Paths();
    offsetter.Execute(solution, delta * CLIPPER_SCALE);
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > minArea);
}

export function booleanPolygons(selectedLoops, operation = 'union') {
    const records = selectedLoops
        .filter((loop) => loop?.closed !== false && loop?.points?.length >= 4)
        .map((loop) => ({
            points: closePoints(loop.points),
            area: Math.abs(polygonArea(loop.points)),
        }))
        .filter((record) => record.area > 1e-6);
    if (records.length < 2) return [];

    // Boolean inputs represent selected filled vectors. Do not infer holes from
    // centroid nesting: overlapping shapes can have their centroid inside a peer.
    const paths = records.map((record) =>
        clipperPathFromPoints(ensurePositiveOrientation(record.points)),
    );
    const fill = ClipperLib.PolyFillType.pftNonZero;
    const execute = (clipType, subject, clip = []) => {
        const clipper = new ClipperLib.Clipper();
        clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
        if (clip.length)
            clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
        const solution = new ClipperLib.Paths();
        clipper.Execute(clipType, solution, fill, fill);
        return solution;
    };

    let solution;
    if (operation === 'difference') {
        solution = execute(
            ClipperLib.ClipType.ctDifference,
            [paths[0]],
            paths.slice(1),
        );
    } else if (operation === 'intersection') {
        solution = [paths[0]];
        for (const path of paths.slice(1)) {
            solution = execute(ClipperLib.ClipType.ctIntersection, solution, [
                path,
            ]);
            if (!solution.length) break;
        }
    } else if (operation === 'xor') {
        solution = [paths[0]];
        for (const path of paths.slice(1)) {
            solution = execute(ClipperLib.ClipType.ctXor, solution, [path]);
        }
    } else {
        solution = execute(ClipperLib.ClipType.ctUnion, paths);
    }
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1e-6);
}

/** Separate filled islands while keeping each immediate hole with its enclosing outline. */
export function groupCompositePolygons(paths) {
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(
        paths.map(clipperPathFromPoints),
        ClipperLib.PolyType.ptSubject,
        true,
    );
    const tree = new ClipperLib.PolyTree();
    clipper.Execute(
        ClipperLib.ClipType.ctUnion,
        tree,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );
    const groups = [],
        pending = [...tree.Childs()];
    while (pending.length) {
        const node = pending.pop();
        const children = node.Childs();
        if (!node.IsHole())
            groups.push([
                pointsFromClipperPath(node.Contour()),
                ...children
                    .filter((child) => child.IsHole())
                    .map((child) => pointsFromClipperPath(child.Contour())),
            ]);
        for (const child of children) pending.push(child);
    }
    return groups;
}
