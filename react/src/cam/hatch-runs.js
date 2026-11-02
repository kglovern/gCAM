function line(path) {
    const points = path.points;
    if (points.length < 2) return null;
    const first = points[0],
        end = points.at(-1);
    const length = Math.hypot(end.x - first.x, end.y - first.y);
    if (!Number.isFinite(length) || length < 1e-9) return null;
    const x = (end.x - first.x) / length,
        y = (end.y - first.y) / length;
    let previous = 0;
    for (const point of points) {
        const dx = point.x - first.x,
            dy = point.y - first.y;
        const along = dx * x + dy * y;
        if (
            !Number.isFinite(along) ||
            Math.abs(dx * y - dy * x) > 1e-8 ||
            along < previous - 1e-8
        )
            return null;
        previous = along;
    }
    return { x, y, end };
}

function sameSettings(a, b) {
    if (b.laserPassStart !== undefined) return false;
    const keys = (path) =>
        Object.keys(path).filter(
            (key) => key !== 'points' && key !== 'laserPassStart',
        );
    const left = keys(a),
        right = keys(b);
    return (
        left.length === right.length && left.every((key) => a[key] === b[key])
    );
}

/** Join overlapping hatch run-ups without changing any powered segment.
 * @template T
 * @param {T[]} paths
 * @returns {T[]}
 */
export function joinHatchRuns(paths, overscan) {
    if (!Number.isFinite(overscan) || overscan < 0)
        throw new Error('Invalid hatch overscan.');
    if (!overscan) return paths;
    const result = [];
    let active = null;
    for (const path of paths) {
        const next = line(path);
        let join = false;
        if (active && next && sameSettings(active.path, path)) {
            const first = path.points[0];
            const dx = first.x - active.end.x,
                dy = first.y - active.end.y;
            const gap = dx * active.x + dy * active.y;
            join =
                active.x * next.x + active.y * next.y > 1 - 1e-10 &&
                Math.abs(dx * active.y - dy * active.x) <= 1e-8 &&
                gap >= 0 &&
                gap <= 2 * overscan;
        }
        if (join) {
            if (!active.copied) {
                active.points = [...active.path.points];
                result[result.length - 1] = {
                    ...active.path,
                    points: active.points,
                };
                active.copied = true;
            }
            active.points.push({ ...path.points[0], power: 0 });
            for (let index = 1; index < path.points.length; index++)
                active.points.push(path.points[index]);
            active.end = next.end;
        } else {
            result.push(path);
            active = next
                ? { ...next, path, points: path.points, copied: false }
                : null;
        }
    }
    return result;
}
