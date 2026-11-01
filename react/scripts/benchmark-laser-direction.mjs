import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Chrome', appName: 'Netscape' },
    configurable: true,
});
const { orderLaserCuts, laserTravel } = await import(
    '../src/cam/laser-order.js'
);
const { buildGcode } = await import('../src/cam/gcode/program.js');
const cornerMode = process.argv.includes('--corner-starts');
const paths = Array.from({ length: 1000 }, (_, id) => {
    const n = (id * 37) % 1000,
        x = (n % 40) * 12,
        y = Math.floor(n / 40) * 12;
    const points = [
        { x, y },
        { x: x + 5, y },
        { x: x + 5, y: y + 5 },
        { x, y: y + 5 },
        { x, y },
    ];
    if (cornerMode) {
        points[0] = { x: x + 2.5, y };
        points.push({ x: x + 2.5, y });
    }
    return {
        id,
        points,
    };
});
const original = JSON.stringify(paths),
    results = [];
const corners = (path) =>
    path.points
        .slice(0, -1)
        .map((p) => `${p.x},${p.y}`)
        .sort();
const variants = cornerMode
    ? [false, true].map((preferCornerStarts) => ({
          cutOrder: 'none',
          preferCornerStarts,
      }))
    : [
          'none',
          'left-to-right',
          'right-to-left',
          'top-to-bottom',
          'bottom-to-top',
      ].map((cutOrder) => ({ cutOrder, preferCornerStarts: false }));
for (const { cutOrder, preferCornerStarts } of variants) {
    const timings = [],
        totals = [];
    let ordered, code;
    for (let i = 0; i < 7; i++) {
        const start = performance.now();
        ordered = orderLaserCuts(paths, {
            innerFirst: false,
            optimizeTravel: true,
            cutOrder,
            preferCornerStarts,
        });
        const arranged = performance.now();
        code = buildGcode({
            toolpaths: [
                {
                    operation: 'laser-cut',
                    emission: 'laser-cut',
                    label: 'direction benchmark',
                    laserFeed: 1200,
                    laserPower: 400,
                    passDepths: [0],
                    previewContours: [],
                    laserOptions: { passes: 1, cutOrder, preferCornerStarts },
                    laserPaths: ordered.map((p) => ({
                        points: p.points.map((point) => ({
                            ...point,
                            power: 400,
                        })),
                    })),
                },
            ],
            fileName: 'direction-benchmark',
            forcePolylineArcs: true,
        });
        if (i) {
            timings.push(arranged - start);
            totals.push(performance.now() - start);
        }
    }
    assert.equal(JSON.stringify(paths), original);
    assert.equal(new Set(ordered.map((p) => p.id)).size, paths.length);
    for (const path of ordered)
        assert.deepEqual(corners(path), corners(paths[path.id]));
    if (preferCornerStarts)
        for (const path of ordered) {
            const original = paths[path.id].points;
            assert(
                original
                    .slice(1, -1)
                    .some(
                        (p) =>
                            p.x === path.points[0].x &&
                            p.y === path.points[0].y,
                    ),
            );
        }
    if (cutOrder !== 'none') {
        const rank = (p) => {
            const { x, y } = paths[p.id].points[0];
            return cutOrder === 'left-to-right'
                ? x
                : cutOrder === 'right-to-left'
                  ? -x
                  : cutOrder === 'bottom-to-top'
                    ? y
                    : -y;
        };
        for (let i = 1; i < ordered.length; i++)
            assert(rank(ordered[i]) >= rank(ordered[i - 1]));
    }
    const median = (numbers) =>
        numbers.sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
    results.push({
        cutOrder,
        preferCornerStarts,
        medianOrderingMs: median(timings),
        medianOrderingAndEmissionMs: median(totals),
        travelMm: laserTravel(ordered),
        gcodeBytes: Buffer.byteLength(code),
    });
}
const report = {
    scope: 'gCAM-only same-process planner/canonical-emitter timing. 1000 scrambled disconnected 5 mm squares, no containment, one warmup plus six samples per mode. Spatial order is a constraint, not a promise of shorter travel. No browser, controller or competitor measurement. RSS is the whole repeated-run process high-water mark.',
    fixture: cornerMode
        ? 'Closed squares starting at a straight-edge midpoint; corner preference off versus on'
        : 'Closed squares starting at a corner; directional policies',
    date: new Date().toISOString(),
    runtime: process.version,
    cpu: cpus()[0].model,
    processPeakRssMiB: process.resourceUsage().maxRSS / 1024,
    results,
};
writeFileSync(
    new URL(
        cornerMode
            ? '../../outputs/laser-corner-start-benchmark.json'
            : '../../outputs/laser-direction-benchmark.json',
        import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
