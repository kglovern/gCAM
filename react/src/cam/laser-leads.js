import { laserOvercutPoints } from './laser-overcut.js';
import { pointInPolygon } from './geometry/polygons.js';
import { boundsOfPoints } from '../geometry/bounds.js';
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Positive angles put closed-contour leads on the scrap side; open paths use their left side. */
export function laserLeadEndpoints(path, options, power = 1, tail) {
    const input = options.leadInLength ?? 0,
        output = options.leadOutLength ?? 0;
    if (!input && !output) return {};
    const points = path.points,
        first = points[0],
        last = points.at(-1);
    const closed = points.length > 3 && distance(first, last) < 1e-7;
    let side = 1;
    if (closed) {
        const area = points
            .slice(1)
            .reduce((n, p, i) => n + points[i].x * p.y - p.x * points[i].y, 0);
        if (Math.abs(area) < 1e-12)
            throw new Error(
                'Laser leads require an outline with a defined inside.',
            );
        side = (area > 0 ? -1 : 1) * (path.laserLeadInside ? -1 : 1);
    }
    const endpoint = (a, b, at, length, angle, entry) => {
        if (!a || !b)
            throw new Error('Laser leads require a nonzero contour segment.');
        const d = distance(a, b);
        if (!(d > 0))
            throw new Error('Laser leads require a nonzero contour segment.');
        const tx = (b.x - a.x) / d,
            ty = (b.y - a.y) / d,
            radians = (angle * Math.PI) / 180;
        const along =
                (entry ? -1 : 1) *
                (closed && (path.laserLeadInside ? angle >= 0 : angle < 0)
                    ? -1
                    : 1) *
                length *
                Math.cos(radians),
            across = length * Math.sin(radians) * side;
        const point = {
            x: at.x + tx * along - ty * across,
            y: at.y + ty * along + tx * across,
            power,
        };
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
            throw new Error('Invalid laser lead geometry.');
        return point;
    };
    const next = points.find((p) => distance(first, p) > 1e-10);
    const endPoints = tail?.length > 1 ? tail : points,
        end = endPoints.at(-1);
    const previous = endPoints
        .slice()
        .reverse()
        .find((p) => distance(end, p) > 1e-10);
    return {
        ...(input
            ? {
                  entry: endpoint(
                      first,
                      next,
                      first,
                      input,
                      options.leadInAngle ?? 45,
                      true,
                  ),
              }
            : {}),
        ...(output
            ? {
                  exit: endpoint(
                      previous,
                      end,
                      end,
                      output,
                      options.leadOutAngle ?? 45,
                      false,
                  ),
              }
            : {}),
    };
}

/** Reject a lead that crosses another closed boundary or goes to the wrong side of its own outline. */
export function validateLaserLeadClearance(
    paths,
    options,
    power,
    finalPass = false,
) {
    const obstacles = paths
        .filter(
            (path) =>
                path.points.length > 3 &&
                distance(path.points[0], path.points.at(-1)) < 1e-7,
        )
        .map((path) => ({ ...path, bounds: boundsOfPoints(path.points) }));
    for (const path of paths) {
        const tail = finalPass
            ? laserOvercutPoints(path.points, options.overcut ?? 0)
            : undefined;
        const leads = laserLeadEndpoints(path, options, power, tail);
        const pairs = [
            [path.points[0], leads.entry, options.leadInAngle ?? 45],
            [
                (tail ?? path.points).at(-1),
                leads.exit,
                options.leadOutAngle ?? 45,
            ],
        ];
        for (const [anchor, end, angle] of pairs) {
            if (!end) continue;
            if (distance(anchor, end) < 1e-10)
                throw new Error(
                    'Laser lead is too short at these coordinates.',
                );
            const closed =
                path.points.length > 3 &&
                distance(path.points[0], path.points.at(-1)) < 1e-7;
            if (closed && Math.abs(Math.sin((angle * Math.PI) / 180)) > 1e-8) {
                const expected = path.laserLeadInside ? angle > 0 : angle < 0;
                if (pointInPolygon(end, path.points) !== expected)
                    throw new Error(
                        'Laser lead reaches the wrong side of its outline; adjust its angle or length.',
                    );
            }
            const box = boundsOfPoints([anchor, end]);
            for (const obstacle of obstacles) {
                const b = obstacle.bounds;
                if (
                    box.maxX < b.minX ||
                    box.minX > b.maxX ||
                    box.maxY < b.minY ||
                    box.minY > b.maxY
                )
                    continue;
                for (let i = 1; i < obstacle.points.length; i++) {
                    const c = obstacle.points[i - 1],
                        d = obstacle.points[i];
                    const dx = end.x - anchor.x,
                        dy = end.y - anchor.y,
                        ex = d.x - c.x,
                        ey = d.y - c.y,
                        den = dx * ey - dy * ex;
                    if (Math.abs(den) < 1e-12) {
                        // Tangential extensions along the source contour are intentional at zero degrees.
                        if (obstacle.points === path.points) continue;
                        const length2 = dx * dx + dy * dy;
                        const offset =
                            (c.x - anchor.x) * dy - (c.y - anchor.y) * dx;
                        if (Math.abs(offset) > 1e-9 * Math.sqrt(length2))
                            continue;
                        const t0 =
                            ((c.x - anchor.x) * dx + (c.y - anchor.y) * dy) /
                            length2;
                        const t1 =
                            ((d.x - anchor.x) * dx + (d.y - anchor.y) * dy) /
                            length2;
                        if (
                            Math.max(t0, t1) > 1e-8 &&
                            Math.min(t0, t1) <= 1 + 1e-8 &&
                            Math.max(t0, t1) >= Math.max(1e-8, Math.min(t0, t1))
                        )
                            throw new Error(
                                'Laser lead overlaps a closed outline; reduce its length or change its angle.',
                            );
                        continue;
                    }
                    const t =
                        ((c.x - anchor.x) * ey - (c.y - anchor.y) * ex) / den;
                    const u =
                        ((c.x - anchor.x) * dy - (c.y - anchor.y) * dx) / den;
                    if (
                        t > 1e-8 &&
                        t <= 1 + 1e-8 &&
                        u >= -1e-8 &&
                        u <= 1 + 1e-8
                    )
                        throw new Error(
                            'Laser lead crosses a closed outline; reduce its length or change its angle.',
                        );
                }
            }
        }
    }
}
