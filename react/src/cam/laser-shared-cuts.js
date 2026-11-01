// Match on a one-nanometre grid without moving the emitted artwork coordinates.
const SCALE = 1e6;
const gcd = (a, b) => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) [a, b] = [b, a % b];
    return a;
};
function line(a, b) {
    const tick = (v) => {
        const n = Math.round(v * SCALE);
        if (!Number.isSafeInteger(n))
            throw new Error(
                'Shared-cut coordinates exceed matching precision.',
            );
        return BigInt(n);
    };
    const ax = tick(a.x),
        ay = tick(a.y),
        bx = tick(b.x),
        by = tick(b.y);
    let dx = bx - ax,
        dy = by - ay;
    const divisor = gcd(dx, dy);
    if (!divisor) return null;
    dx /= divisor;
    dy /= divisor;
    if (dx < 0n || (dx === 0n && dy < 0n)) {
        dx = -dx;
        dy = -dy;
    }
    return {
        key: `${dx},${dy},${dx * ay - dy * ax}`,
        start: Number(dx ? ax : ay),
        end: Number(dx ? bx : by),
    };
}
function merge(list, lo, hi) {
    let left = 0,
        right = list.length;
    while (left < right) {
        const mid = (left + right) >>> 1;
        if (list[mid][1] < lo) left = mid + 1;
        else right = mid;
    }
    let end = left;
    while (end < list.length && list[end][0] <= hi) {
        lo = Math.min(lo, list[end][0]);
        hi = Math.max(hi, list[end][1]);
        end++;
    }
    list.splice(left, end - left, [lo, hi]);
}
/** Keep each powered shared segment once per pass, across paths in this operation only. */
export function removeSharedLaserCuts(paths, pointBudget = 2000000) {
    const covered = new Map(),
        result = [];
    let count = 0;
    const append = (points, point) => {
        if (++count > pointBudget)
            throw new Error('Shared cuts exceed the job point budget.');
        points.push(point);
    };
    for (const path of paths) {
        const points = [],
            pending = [];
        append(points, { ...path.points[0] });
        for (let i = 1; i < path.points.length; i++) {
            const a = path.points[i - 1],
                b = path.points[i];
            const segment = b.power > 0 ? line(a, b) : null;
            if (!segment) {
                append(points, { ...b });
                continue;
            }
            const { key, start, end } = segment;
            const lo = Math.min(start, end),
                hi = Math.max(start, end);
            const list = covered.get(key) ?? [];
            const splits = [0, 1];
            let left = 0,
                right = list.length;
            while (left < right) {
                const mid = (left + right) >>> 1;
                if (list[mid][1] <= lo) left = mid + 1;
                else right = mid;
            }
            const overlaps = [];
            for (let j = left; j < list.length && list[j][0] < hi; j++) {
                const from = Math.max(lo, list[j][0]),
                    to = Math.min(hi, list[j][1]);
                if (from >= to) continue;
                const t0 = (from - start) / (end - start),
                    t1 = (to - start) / (end - start);
                if (count + splits.length + 1 > pointBudget)
                    throw new Error('Shared cuts exceed the job point budget.');
                overlaps.push([Math.min(t0, t1), Math.max(t0, t1)]);
                splits.push(t0, t1);
            }
            if (!overlaps.length) {
                append(points, { ...b });
                pending.push([key, lo, hi]);
                continue;
            }
            const stops = [...new Set(splits)].sort((x, y) => x - y);
            let overlap = start < end ? 0 : overlaps.length - 1;
            for (let j = 1; j < stops.length; j++) {
                const t = stops[j],
                    mid = (stops[j - 1] + t) / 2;
                while (
                    overlap >= 0 &&
                    overlap < overlaps.length &&
                    mid > overlaps[overlap][1]
                )
                    overlap += start < end ? 1 : -1;
                const skip =
                    overlap >= 0 &&
                    overlap < overlaps.length &&
                    mid >= overlaps[overlap][0] &&
                    mid <= overlaps[overlap][1];
                append(points, {
                    ...b,
                    x: t === 1 ? b.x : a.x + (b.x - a.x) * t,
                    y: t === 1 ? b.y : a.y + (b.y - a.y) * t,
                    power: skip ? 0 : b.power,
                });
            }
            pending.push([key, lo, hi]);
        }
        for (const [key, lo, hi] of pending) {
            if (!covered.has(key)) covered.set(key, []);
            merge(covered.get(key), lo, hi);
        }
        if (points.slice(1).some((p) => p.power > 0)) {
            if (
                points.length > 3 &&
                points[0].x === points.at(-1).x &&
                points[0].y === points.at(-1).y
            )
                points[0].power = points.at(-1).power;
            result.push({ ...path, points });
        }
    }
    return result;
}
