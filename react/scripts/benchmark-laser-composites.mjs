import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Chrome', appName: 'Netscape' },
    configurable: true,
});
const { compositePocketSeedPaths } = await import(
    '../src/cam/geometry/polygons.js'
);
const { polygonArea } = await import('../src/geometry/bounds.js');
const rect = (x, y, w, h) => ({
    points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
    ].map(([x, y]) => ({ x, y })),
});
const shape = (pairs) => ({
    points: [...pairs, pairs[0]].map(([x, y]) => ({ x, y })),
});
const outer = shape([
    [0, 0],
    [10, 0],
    [10, 3],
    [3, 3],
    [3, 7],
    [10, 7],
    [10, 10],
    [0, 10],
]);
const hole = shape([
    [0.5, 0.5],
    [9.5, 0.5],
    [9.5, 2.5],
    [2.5, 2.5],
    [2.5, 7.5],
    [9.5, 7.5],
    [9.5, 9.5],
    [0.5, 9.5],
]);
const nested = Array.from({ length: 100 }, (_, i) =>
    rect(i, i, 220 - 2 * i, 220 - 2 * i),
);
const expectedNested = nested.reduce(
    (n, r, i) => n + (i % 2 ? -1 : 1) * Math.abs(polygonArea(r.points)),
    0,
);
const fixtures = [
    {
        name: 'overlapping rectangles',
        loops: [rect(0, 0, 10, 10), rect(4, 2, 10, 6)],
        expected: 124,
    },
    {
        name: 'concave enclosed hole',
        loops: [outer, hole],
        expected:
            Math.abs(polygonArea(outer.points)) -
            Math.abs(polygonArea(hole.points)),
    },
    {
        name: 'duplicate enclosing outlines',
        loops: [rect(0, 0, 10, 10), rect(0, 0, 10, 10), rect(2, 2, 6, 6)],
        expected: 64,
    },
    {
        name: '100 separated rectangles',
        loops: Array.from({ length: 100 }, (_, i) => rect(i * 20, 0, 10, 10)),
        expected: 10000,
    },
    { name: '100 nested rectangles', loops: nested, expected: expectedNested },
];
const baseline = process.argv.includes('--baseline');
const results = fixtures.map(({ name, loops, expected }) => {
    const runs = [];
    let actual;
    for (let i = 0; i < 7; i++) {
        const start = performance.now(),
            result = compositePocketSeedPaths(loops, 1e-8);
        runs.push(performance.now() - start);
        actual = result.reduce((n, p) => n + polygonArea(p), 0);
        if (!baseline) assert(Math.abs(actual - expected) < 1e-6, name);
    }
    return {
        name,
        expectedArea: expected,
        actualArea: actual,
        coldMs: runs[0],
        medianMs: runs.slice(2).sort((a, b) => a - b)[2],
        measurementsMs: runs.slice(2),
    };
});
const report = {
    runtime: process.version,
    scope: 'Internal polygon correctness and generation timing; one warmup and five measurements; no physical/competitor evidence',
    results,
};
mkdirSync('../outputs', { recursive: true });
writeFileSync(
    `../outputs/laser-composites-${baseline ? 'before' : 'after'}.json`,
    JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
