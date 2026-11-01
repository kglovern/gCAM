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
const square = (x, y, size) => ({
    points: [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
    ].map(([x, y]) => ({ x, y })),
});
const fixtures = [20, 100, 400].map((parts) => {
    const loops = [];
    for (let i = 0; i < parts; i++) {
        const j = (i * 37) % parts,
            x = (j % 20) * 20,
            y = Math.floor(j / 20) * 20;
        loops.push(square(x, y, 16), square(x + 5, y + 5, 3));
    }
    return { parts, loops };
});
const results = fixtures.map(({ parts, loops }) => {
    const modes = [false, true].map((optimizeTravel) => {
        const start = performance.now();
        const toolpath = createLaserToolpath(loops, {
            operation: 'laser-cut',
            laserFeed: 1200,
            laserPower: 300,
            laserSpot: 0.1,
            laserSMin: 0,
            laserSMax: 1000,
            laserGamma: 1,
            laserOverscan: 0,
            laserOptions: { innerFirst: true, optimizeTravel },
        });
        const planningMs = performance.now() - start;
        const code = buildGcode({
            toolpaths: [toolpath],
            fileName: 'cut-benchmark',
            forcePolylineArcs: true,
        });
        assert(!/M6|G[01] Z/.test(code));
        assert.equal(toolpath.laserPaths.length, parts * 2);
        return {
            optimizeTravel,
            planningMs,
            travelMm: laserTravel(toolpath.laserPaths),
            gcodeBytes: Buffer.byteLength(code),
        };
    });
    assert(modes[1].travelMm <= modes[0].travelMm);
    return { parts, modes };
});
const report = {
    kind: 'gCAM vector ordering; origin start; no competitor or physical timing',
    runtime: process.version,
    date: new Date().toISOString(),
    results,
};
const directory = new URL('../../outputs/laser-benchmarks/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(
    new URL(`cuts-${Date.now()}.json`, directory),
    JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
