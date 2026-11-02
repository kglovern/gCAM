import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Chrome', appName: 'Netscape' },
    configurable: true,
});
const { createLaserToolpath } = await import('../src/cam/laser.js');
const { laserTravel } = await import('../src/cam/laser-order.js');
const { buildGcode } = await import('../src/cam/gcode/program.js');
const median = (values) =>
    values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = [];
for (const count of [20, 100]) {
    const loops = Array.from({ length: count }, (_, i) => {
        const x = i * 40,
            y = 0;
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
    let baseline;
    for (const fillSequence of ['all', 'individual']) {
        const runs = [];
        for (let i = 0; i < 7; i++) {
            const start = performance.now();
            const tp = createLaserToolpath(loops, {
                operation: 'laser-fill',
                laserFeed: 2400,
                laserPower: 400,
                laserSpot: 0.1,
                laserSMin: 0,
                laserSMax: 1000,
                laserGamma: 1,
                laserOverscan: 2,
                laserOptions: { fillSequence },
            });
            const camMs = performance.now() - start;
            const emitStart = performance.now();
            const code = buildGcode({
                toolpaths: [tp],
                fileName: 'fill-sequence',
                forcePolylineArcs: true,
            });
            const emitMs = performance.now() - emitStart;
            const coverage = tp.laserPaths
                .map((path) =>
                    path.points
                        .map((p) =>
                            [p.x.toFixed(6), p.y.toFixed(6), p.power].join(','),
                        )
                        .sort()
                        .join(':'),
                )
                .sort();
            if (!baseline) baseline = coverage;
            else assert.deepEqual(coverage, baseline);
            runs.push({
                camMs,
                emitMs,
                bytes: Buffer.byteLength(code),
                travelMm: laserTravel(tp.laserPaths),
                paths: tp.laserPaths.length,
                rssBytes: process.memoryUsage().rss,
            });
        }
        const measured = runs.slice(2);
        modes.push({
            fillSequence,
            cold: runs[0],
            warmups: 1,
            medianCamMs: median(measured.map((r) => r.camMs)),
            medianEmitMs: median(measured.map((r) => r.emitMs)),
            measurements: measured,
        });
    }
    results.push({ shapes: count, modes });
}
const report = {
    scope: 'gCAM internal fill sequencing; exact rounded coverage assertions, same-process medians; process-level cumulative RSS; no competitor or physical runtime measurements',
    date: new Date().toISOString(),
    runtime: process.version,
    results,
};
mkdirSync('../outputs', { recursive: true });
writeFileSync(
    '../outputs/laser-fill-sequence-benchmark.json',
    JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
