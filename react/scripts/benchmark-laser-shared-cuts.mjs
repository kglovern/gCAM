import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Chrome', appName: 'Netscape' },
    configurable: true,
});
const { createLaserToolpath } = await import('../src/cam/laser.js');
const { buildGcode } = await import('../src/cam/gcode/program.js');
const median = (values) =>
    values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = [];
for (const [cols, rows] of [
    [10, 10],
    [20, 20],
]) {
    const loops = Array.from({ length: cols * rows }, (_, i) => {
        const x = (i % cols) * 10,
            y = Math.floor(i / cols) * 10;
        return {
            points: [
                [x, y],
                [x + 10, y],
                [x + 10, y + 10],
                [x, y + 10],
                [x, y],
            ].map(([x, y]) => ({ x, y })),
        };
    });
    const modes = [];
    for (const removeSharedCuts of [false, true]) {
        const runs = [];
        for (let i = 0; i < 7; i++) {
            const start = performance.now();
            const tp = createLaserToolpath(loops, {
                operation: 'laser-cut',
                laserFeed: 1200,
                laserPower: 400,
                laserSpot: 0.1,
                laserSMin: 0,
                laserSMax: 1000,
                laserGamma: 1,
                laserOverscan: 0,
                laserOptions: {
                    innerFirst: true,
                    optimizeTravel: true,
                    removeSharedCuts,
                },
            });
            const camMs = performance.now() - start;
            const emitStart = performance.now();
            const code = buildGcode({
                toolpaths: [tp],
                fileName: 'shared-cuts',
                forcePolylineArcs: true,
            });
            const emitMs = performance.now() - emitStart;
            let on = 0,
                off = 0;
            for (const path of tp.laserPaths)
                for (let k = 1; k < path.points.length; k++) {
                    const a = path.points[k - 1],
                        b = path.points[k],
                        d = Math.hypot(b.x - a.x, b.y - a.y);
                    if (b.power > 0) on += d;
                    else off += d;
                }
            const expected = removeSharedCuts
                ? (2 * cols * rows + cols + rows) * 10
                : cols * rows * 40;
            assert(Math.abs(on - expected) < 1e-6);
            runs.push({
                camMs,
                emitMs,
                bytes: Buffer.byteLength(code),
                poweredMm: on,
                offMm: off,
                rssBytes: process.memoryUsage().rss,
            });
        }
        const measured = runs.slice(2);
        modes.push({
            removeSharedCuts,
            cold: runs[0],
            warmups: 1,
            medianCamMs: median(measured.map((r) => r.camMs)),
            medianEmitMs: median(measured.map((r) => r.emitMs)),
            measurements: measured,
        });
    }
    results.push({ cols, rows, modes });
}
const report = {
    scope: 'gCAM internal shared-line optimization; same-process medians, RSS is process-level and cumulative; no competitor, hardware throughput or physical quality measurements',
    date: new Date().toISOString(),
    runtime: process.version,
    results,
};
mkdirSync('../outputs', { recursive: true });
writeFileSync(
    '../outputs/laser-shared-cuts-benchmark.json',
    JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
