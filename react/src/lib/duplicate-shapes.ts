import type { ViewLoop } from '../canvas/types';
type Tick = { x: number; y: number };
const compare = (a: Tick, b: Tick) =>
    a.x === b.x ? Math.sign(a.y - b.y) : Math.sign(a.x - b.x);
const straight = (a: Tick, b: Tick, c: Tick) => {
    const x = b.x - a.x,
        y = b.y - a.y,
        u = c.x - b.x,
        v = c.y - b.y;
    const p = x * v,
        q = y * u;
    const collinear =
        Number.isSafeInteger(p) && Number.isSafeInteger(q)
            ? p === q
            : BigInt(x) * BigInt(v) === BigInt(y) * BigInt(u);
    return collinear && (x !== 0 ? x * u >= 0 : y * v >= 0);
};
function normalized(shape: ViewLoop) {
    const raw: Tick[] = [];
    for (const p of shape.points) {
        const tick = { x: Math.round(p.x * 1e6), y: Math.round(p.y * 1e6) };
        if (!raw.length || compare(raw[raw.length - 1], tick) !== 0)
            raw.push(tick);
    }
    const closed = raw.length > 2 && compare(raw[0], raw[raw.length - 1]) === 0;
    if (closed) raw.pop();
    const points: Tick[] = [];
    for (const p of raw) {
        while (
            points.length > 1 &&
            straight(points[points.length - 2], points[points.length - 1], p)
        )
            points.pop();
        points.push(p);
    }
    let start = 0;
    if (closed)
        while (points.length - start > 2) {
            const last = points.length - 1;
            if (straight(points[last], points[start], points[start + 1]))
                start++;
            else if (straight(points[last - 1], points[last], points[start]))
                points.pop();
            else break;
        }
    return { points: points.slice(start), closed };
}
// Booth's minimum cyclic rotation keeps repeated-vertex rings linear in path length.
function rotation(points: Tick[]) {
    let i = 0,
        j = 1,
        k = 0;
    const n = points.length;
    while (i < n && j < n && k < n) {
        const cmp = compare(points[(i + k) % n], points[(j + k) % n]);
        if (cmp === 0) {
            k++;
            continue;
        }
        if (cmp > 0) {
            i += k + 1;
            if (i <= j) i = j + 1;
        } else {
            j += k + 1;
            if (j <= i) j = i + 1;
        }
        k = 0;
    }
    return Math.min(i, j);
}
function geometryKey(shape: ViewLoop) {
    const { points, closed } = normalized(shape);
    if (points.length < 2) return null;
    const reverse = [...points].reverse(),
        a = closed ? rotation(points) : 0,
        b = closed ? rotation(reverse) : 0,
        n = points.length;
    let chosen = points,
        start = a;
    for (let k = 0; k < n; k++) {
        const cmp = compare(points[(a + k) % n], reverse[(b + k) % n]);
        if (cmp === 0) continue;
        if (cmp > 0) {
            chosen = reverse;
            start = b;
        }
        break;
    }
    const parts = new Array<string>(n);
    for (let k = 0; k < n; k++) {
        const p = chosen[(start + k) % n];
        parts[k] = `${p.x},${p.y}`;
    }
    return `${closed ? 'C' : 'O'}:${parts.join(';')}`;
}
/** Input limits and finite coordinates are checked by the path-repair worker boundary. */
export function duplicateShapes(shapes: ViewLoop[], acrossLayers = false) {
    const seen = new Map<string, string>(),
        removed: string[] = [],
        keepers = new Set<string>();
    let scanned = 0;
    for (const shape of shapes) {
        if (shape.bitmapId || shape.groupId) continue;
        const key = geometryKey(shape);
        if (!key) continue;
        scanned++;
        const bucket = `${acrossLayers ? '' : JSON.stringify([shape.layerId ?? '', shape.layerColor ?? ''])}|${key}`;
        const keeper = seen.get(bucket);
        if (keeper !== undefined) {
            removed.push(shape.id);
            keepers.add(keeper);
        } else seen.set(bucket, shape.id);
    }
    const removedIds = new Set(removed);
    return {
        shapes: shapes.filter((s) => !removedIds.has(s.id)),
        changedIds: removed,
        found: 0,
        joined: 0,
        closed: 0,
        remaining: 0,
        ambiguous: 0,
        duplicates: removed.length,
        duplicateKeepIds: [...keepers],
        scanned,
        skipped: shapes.length - scanned,
    };
}
