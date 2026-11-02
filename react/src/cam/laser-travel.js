import { laserLeadEndpoints } from './laser-leads.js';
import { laserOvercutPoints } from './laser-overcut.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function stops(path, options) {
    const tail = laserOvercutPoints(path.points, options.overcut ?? 0);
    const normal = laserLeadEndpoints(path, options);
    const final = tail ? laserLeadEndpoints(path, options, 1, tail) : normal;
    return {
        entry: normal.entry ?? path.points[0],
        exit: normal.exit ?? path.points.at(-1),
        finalExit: final.exit ?? tail?.at(-1) ?? path.points.at(-1),
    };
}

function passCount(options) {
    const passes = options.passes ?? 1;
    if (!Number.isInteger(passes) || passes < 1 || passes > 100)
        throw new Error('Laser travel requires between 1 and 100 passes.');
    return passes;
}

function edge(model, order, index, passes, start) {
    if (index >= order.length) return 0;
    const current = model[order[index]];
    if (index === 0)
        return (
            distance(start, current.entry) +
            (passes - 1) * distance(model[order.at(-1)].exit, current.entry)
        );
    const previous = model[order[index - 1]];
    return (
        (passes - 1) * distance(previous.exit, current.entry) +
        distance(previous.finalExit, current.entry)
    );
}

function total(model, order, passes, start) {
    return order.reduce(
        (sum, _, index) => sum + edge(model, order, index, passes, start),
        0,
    );
}

/** Between-contour travel, including repeated passes, leads and final-pass overcut. */
export function laserTravel(paths, start = { x: 0, y: 0 }, options = {}) {
    const model = paths.map((path) => stops(path, options));
    return total(
        model,
        paths.map((_, index) => index),
        passCount(options),
        start,
    );
}

/** Improve only ordering: source points, starts, winding and powers are untouched.
 * @template T
 * @param {{paths: T[], indices: number[]}} route
 * @returns {{paths: T[], indices: number[]}}
 */
export function refineLaserRoute(route, children, ranks, options) {
    const count = route.paths.length;
    if (count < 2) return route;
    const parents = children.map(() => []);
    let relations = 0;
    for (let parent = 0; parent < children.length; parent++)
        for (const child of children[parent]) {
            if (++relations > 100000) return route;
            parents[child].push(parent);
        }
    const positions = new Int32Array(children.length);
    route.indices.forEach((id, index) => {
        positions[id] = index;
    });
    const model = route.paths.map((path) => stops(path, options));
    const order = route.paths.map((_, index) => index);
    const passes = passCount(options),
        start = { x: 0, y: 0 };
    const original = total(model, order, passes, start);
    let attempts = 0,
        checks = 0;
    // shortcut: four bounded swap passes; use a different solver only if matched job benchmarks justify it.
    search: for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        const limit = attempts + 2500;
        for (let offset = 0; offset < count && attempts < limit; offset++) {
            const a = (offset + Math.floor((pass * count) / 4)) % count;
            for (let b = a + 1; b < count && attempts < limit; b++) {
                if (attempts++ >= 10000 || checks >= 100000) break search;
                const left = route.indices[order[a]],
                    right = route.indices[order[b]];
                if (ranks && ranks[left] !== ranks[right]) continue;
                const position = (id) =>
                    id === left ? b : id === right ? a : positions[id];
                const valid = (id, at) => {
                    for (const child of children[id])
                        if (++checks > 100000 || position(child) >= at)
                            return false;
                    for (const parent of parents[id])
                        if (++checks > 100000 || position(parent) <= at)
                            return false;
                    return true;
                };
                if (!valid(left, b) || !valid(right, a)) continue;
                const affected = new Set([0, a, a + 1, b, b + 1]);
                let before = 0,
                    after = 0;
                for (const index of affected)
                    before += edge(model, order, index, passes, start);
                [order[a], order[b]] = [order[b], order[a]];
                for (const index of affected)
                    after += edge(model, order, index, passes, start);
                if (after < before - 1e-7) {
                    positions[left] = b;
                    positions[right] = a;
                    changed = true;
                } else [order[a], order[b]] = [order[b], order[a]];
            }
        }
        if (!changed && attempts < limit) break;
    }
    if (total(model, order, passes, start) >= original - 1e-7) return route;
    return {
        paths: order.map((index) => route.paths[index]),
        indices: order.map((index) => route.indices[index]),
    };
}
