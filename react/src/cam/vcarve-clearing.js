import {
    compositePocketSeedPaths,
    offsetCompositePolygons,
} from './geometry/polygons.js';
import { buildPassDepths } from './operations/contract.js';

/** Keep natural corner paths only above the pass plane; never flatten deep medial spans into floor cuts. */
export function vCarveFinishPaths(
    paths,
    loops,
    depth,
    passDepth,
    angle,
    diameter,
) {
    const result = [];
    for (const z of buildPassDepths(depth, passDepth)) {
        for (const path of paths) {
            let points = [];
            const flush = () => {
                if (points.length > 1 && points.some((p) => p.z < -1e-6))
                    result.push({ safeToClose: false, points });
                points = [];
            };
            for (let i = 1; i < path.points.length; i++) {
                let a = path.points[i - 1],
                    b = path.points[i];
                // The native engine inserts vertical entry/exit moves at deep medial nodes.
                if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-7) {
                    flush();
                    continue;
                }
                if (a.z < z && b.z < z) {
                    flush();
                    continue;
                }
                if (a.z < z || b.z < z) {
                    const t = (z - a.z) / (b.z - a.z);
                    const intersection = {
                        x: a.x + t * (b.x - a.x),
                        y: a.y + t * (b.y - a.y),
                        z,
                    };
                    if (a.z < z) a = intersection;
                    else b = intersection;
                }
                if (!points.length) points.push({ ...a });
                points.push({ ...b });
                if (path.points[i].z < z) flush();
            }
            flush();
        }
        for (const boundary of vCarveClearingRegion(loops, -z, angle, diameter))
            result.push({
                safeToClose: false,
                points: boundary.map((p) => ({ ...p, z })),
            });
    }
    return result;
}

export function vCarveClearingRegion(loops, depth, angle, diameter) {
    if (
        !Number.isFinite(depth) ||
        depth <= 0 ||
        !Number.isFinite(angle) ||
        angle <= 0 ||
        angle >= 180
    )
        throw new Error(
            'V-carve clearing needs a positive depth and a valid V-bit angle.',
        );
    const inset = depth * Math.tan((angle * Math.PI) / 360);
    if (
        !Number.isFinite(diameter) ||
        diameter <= 0 ||
        inset > diameter / 2 + 1e-6
    )
        throw new Error(
            'The V-bit is too narrow at this depth. Reduce depth or choose a larger V-bit.',
        );
    if (
        loops.some(
            (l) =>
                l.points.length < 4 ||
                Math.hypot(
                    l.points[0].x - l.points.at(-1).x,
                    l.points[0].y - l.points.at(-1).y,
                ) > 1e-5,
        )
    )
        throw new Error('V-carve clearing needs closed shapes.');
    const region = offsetCompositePolygons(
        compositePocketSeedPaths(loops),
        -inset,
    );
    if (!region.length)
        throw new Error(
            'No flat area remains at this V-carve depth. A clearing toolpath is unnecessary.',
        );
    return region;
}
