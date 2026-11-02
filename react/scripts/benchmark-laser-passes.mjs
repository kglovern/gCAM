import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const mode = process.argv[2];
if (!mode) {
    const results = ['replanned', 'cached'].map((name) => {
        const child = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), name],
            { encoding: 'utf8', windowsHide: true },
        );
        assert.equal(child.status, 0, child.stderr || child.stdout);
        return JSON.parse(child.stdout);
    });
    assert.equal(
        results[0].hash,
        results[1].hash,
        'Canonical programs must match byte for byte.',
    );
    console.log(
        JSON.stringify(
            {
                scope: 'gCAM-only repeated-angle planning comparison; no controller or competitor measurement',
                runtime: process.version,
                cpu: os.cpus()[0]?.model,
                fixture:
                    '40 x 20 mm, 0.1 mm pitch, 64-tone gradient, 12 passes at 90-degree increments',
                results,
            },
            null,
            2,
        ),
    );
} else {
    assert(['replanned', 'cached'].includes(mode));
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { createLaserToolpath } = await import('../src/cam/laser.js');
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const config = {
        operation: 'laser-raster',
        spindle: 12000,
        toolDiameter: 1,
        toolNumber: 1,
        feedRate: 1200,
        plungeRate: 300,
        safeZ: 5,
        laserFeed: 1200,
        laserPower: 500,
        laserSMax: 500,
        laserSMin: 0,
        laserGamma: 1,
        laserSpot: 0.1,
        laserOverscan: 2,
        laserOptions: { passes: 12, angleIncrement: 90 },
    };
    const options = {
        sourceEntities: [
            {
                type: 'BITMAP',
                bounds: { minX: 0, minY: 0, maxX: 40, maxY: 20 },
                _imageData: {
                    width: 64,
                    height: 1,
                    data: Array.from({ length: 64 }, (_, i) => [
                        Math.round((i * 255) / 63),
                        Math.round((i * 255) / 63),
                        Math.round((i * 255) / 63),
                        255,
                    ]).flat(),
                },
            },
        ],
    };
    const runs = [];
    let hash, bytes, cold;
    for (let run = 0; run < 6; run++) {
        const start = performance.now();
        let result;
        if (mode === 'cached')
            result = createLaserToolpath([], config, options);
        else {
            const planned = Array.from({ length: 12 }, (_, pass) =>
                createLaserToolpath(
                    [],
                    {
                        ...config,
                        laserOptions: {
                            passes: 1,
                            scanAngle: (pass * 90) % 360,
                        },
                    },
                    options,
                ),
            );
            result = {
                ...planned[0],
                laserOptions: {
                    ...planned[0].laserOptions,
                    angleIncrement: 90,
                },
                laserPassCount: 12,
                laserPaths: planned.flatMap((p, pass) =>
                    p.laserPaths.map((path, i) =>
                        i ? path : { ...path, laserPassStart: pass + 1 },
                    ),
                ),
                previewContours: planned.flatMap((p) => p.previewContours),
            };
        }
        const plannedAt = performance.now();
        const gcode = buildGcode({
            toolpaths: [result],
            fileName: 'pass-benchmark',
            forcePolylineArcs: true,
        });
        const end = performance.now();
        const currentHash = createHash('sha256').update(gcode).digest('hex');
        if (hash) assert.equal(currentHash, hash);
        hash = currentHash;
        bytes = Buffer.byteLength(gcode);
        const timing = {
            planningMs: plannedAt - start,
            planningAndEmissionMs: end - start,
        };
        if (run === 0) cold = timing;
        if (run >= 3) runs.push(timing);
    }
    console.log(
        JSON.stringify({
            mode,
            cold,
            warmupRuns: 2,
            runs,
            hash,
            bytes,
            maxProcessRssMiB: process.resourceUsage().maxRSS / 1024,
        }),
    );
}
