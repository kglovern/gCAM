import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const mode = process.argv[2];
if (!mode) {
    const results = ['individual', 'deferred'].map((mode) => {
        const child = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), mode],
            { encoding: 'utf8', windowsHide: true },
        );
        assert.equal(child.status, 0, child.stderr || child.stdout);
        return JSON.parse(child.stdout);
    });
    assert.equal(
        results[0].hash,
        results[1].hash,
        'Final programs must be byte-identical.',
    );
    console.log(
        JSON.stringify(
            {
                scope: 'gCAM core planning/emission only; excludes browser worker startup/clone, profiles, competitors and controller throughput',
                runtime: process.version,
                cpu: os.cpus()[0]?.model,
                fixture:
                    '3 images, each 40 x 20 mm, 0.05 mm pitch, 64 gray levels, 2 passes',
                results,
            },
            null,
            2,
        ),
    );
} else {
    assert(['individual', 'deferred'].includes(mode));
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { createLaserToolpath } = await import('../src/cam/laser.js');
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const { validateToolpaths } = await import(
        '../src/cam/gcode-validation.js'
    );
    const data = new Uint8ClampedArray(
        Array.from({ length: 64 }, (_, i) => [
            Math.round((i * 255) / 63),
            Math.round((i * 255) / 63),
            Math.round((i * 255) / 63),
            255,
        ]).flat(),
    );
    const timings = [];
    let hash,
        bytes,
        cold,
        discardedBytes = 0;
    for (let run = 0; run < 6; run++) {
        const start = performance.now(),
            paths = [];
        let discarded = 0;
        for (let index = 0; index < 3; index++) {
            const result = createLaserToolpath(
                [],
                {
                    operation: 'laser-raster',
                    toolDiameter: 1,
                    cutDepth: 1,
                    spindle: 12000,
                    toolNumber: 1,
                    feedRate: 1200,
                    plungeRate: 300,
                    safeZ: 5,
                    laserFeed: 1200,
                    laserPower: 500,
                    laserSMax: 500,
                    laserSMin: 0,
                    laserGamma: 1,
                    laserSpot: 0.05,
                    laserOverscan: 2,
                    laserOptions: { passes: 2 },
                },
                {
                    id: `image-${index}`,
                    label: `Image ${index + 1}`,
                    sourceEntities: [
                        {
                            type: 'BITMAP',
                            bounds: {
                                minX: index * 50,
                                minY: 0,
                                maxX: index * 50 + 40,
                                maxY: 20,
                            },
                            _imageData: { width: 64, height: 1, data },
                        },
                    ],
                },
            );
            paths.push(result);
            if (mode === 'individual')
                discarded += Buffer.byteLength(
                    buildGcode({
                        toolpaths: [result],
                        fileName: 'deferred-emission',
                        forcePolylineArcs: true,
                    }),
                );
            else validateToolpaths([result]);
        }
        const program = buildGcode({
            toolpaths: paths,
            fileName: 'deferred-emission',
            forcePolylineArcs: true,
        });
        const elapsed = performance.now() - start;
        const current = createHash('sha256').update(program).digest('hex');
        if (hash) assert.equal(current, hash);
        hash = current;
        bytes = Buffer.byteLength(program);
        discardedBytes = discarded;
        if (run === 0) cold = elapsed;
        if (run >= 3) timings.push(elapsed);
    }
    console.log(
        JSON.stringify({
            mode,
            coldMs: cold,
            warmupRuns: 2,
            milliseconds: timings,
            medianMs: [...timings].sort((a, b) => a - b)[1],
            outputBytes: bytes,
            discardedBytes,
            peakRssMiB: process.resourceUsage().maxRSS / 1024,
            hash,
        }),
    );
}
