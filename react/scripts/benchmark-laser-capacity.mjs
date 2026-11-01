import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { largeRasterRequest } from '../src/cam/fixtures/laser-large-raster.js';

const cases = [
    { name: 'gradient-6m', detail: 'gradient' },
    { name: 'noise-6m', detail: 'noise' },
    { name: 'jarvis-solid-6m', mode: 'jarvis' },
    { name: 'stucki-solid-6m', mode: 'stucki' },
    { name: 'halftone-gradient-6m', mode: 'halftone', detail: 'gradient' },
    { name: 'edge-noise-6m', mode: 'edge', detail: 'noise' },
    { name: 'solid-16m', width: 400, height: 400 },
    {
        name: 'dense-6m-100-passes',
        detail: 'stripes',
        passes: 100,
        reject: true,
    },
];
const requested = process.argv.indexOf('--case');
if (requested < 0) {
    const results = cases.map(({ name }) => {
        const child = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), '--case', name],
            {
                encoding: 'utf8',
                windowsHide: true,
            },
        );
        assert.equal(child.status, 0, child.stderr || child.stdout);
        return JSON.parse(child.stdout);
    });
    const report = {
        kind: 'Large flat raster capacity; no competitor or machine measurement',
        date: new Date().toISOString(),
        runtime: process.version,
        cpu: os.cpus()[0]?.model,
        results,
    };
    const directory = new URL(
        '../../outputs/laser-benchmarks/',
        import.meta.url,
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        new URL(`capacity-${Date.now()}.json`, directory),
        `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
} else {
    const fixture = cases.find(
        (item) => item.name === process.argv[requested + 1],
    );
    assert(fixture);
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { createLaserToolpath } = await import('../src/cam/laser.js');
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const { config, options } = largeRasterRequest(fixture);
    const samples =
        Math.ceil((fixture.width ?? 300) / config.laserSpot) *
        Math.ceil((fixture.height ?? 200) / config.laserSpot);
    const runs = [];
    for (let run = 0; run < 3; run++) {
        let percent = 0;
        const start = performance.now();
        try {
            const path = createLaserToolpath([], config, {
                ...options,
                onProgress: (p) => {
                    percent = p;
                },
            });
            assert(!fixture.reject, 'Dense output should have been rejected');
            const planned = performance.now();
            const code = buildGcode({
                toolpaths: [path],
                fileName: fixture.name,
                forcePolylineArcs: true,
            });
            assert(code.includes('M4 S0') && code.includes('M5'));
            runs.push({
                planningMs: planned - start,
                totalMs: performance.now() - start,
                rows: path.laserPaths.length,
                points: path.laserPaths.reduce(
                    (n, p) => n + p.points.length,
                    0,
                ),
                previewSegments: path.laserPaths.reduce(
                    (n, row) =>
                        n +
                        row.points.slice(1).filter((p) => p.power > 0).length,
                    0,
                ),
                gcodeBytes: Buffer.byteLength(code),
            });
        } catch (error) {
            assert(
                fixture.reject && /Laser job is too large/.test(error.message),
                error.stack,
            );
            assert(percent < 15, 'Dense output must stop early');
            runs.push({
                rejectionMs: performance.now() - start,
                percent,
                error: error.message,
            });
        }
    }
    console.log(
        JSON.stringify({
            ...fixture,
            samples,
            runs,
            maxProcessRssMiB: process.resourceUsage().maxRSS / 1024,
        }),
    );
}
