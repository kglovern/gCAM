import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Isolate cases so maximum RSS does not inherit the previous job's allocation.
const cases = [
    { name: 'gradient-250k', size: 100, interval: 0.2, mode: 'grayscale' },
    { name: 'dither-250k', size: 100, interval: 0.2, mode: 'jarvis' },
    {
        name: 'diagonal-1m',
        size: 100,
        interval: 0.142,
        angle: 45,
        mode: 'atkinson',
    },
];
const requested = process.argv.indexOf('--case');
if (requested < 0) {
    const results = cases.map(({ name }) => {
        const child = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), '--case', name],
            { encoding: 'utf8', windowsHide: true },
        );
        if (child.status !== 0)
            throw new Error(`${name}: ${child.stderr || child.stdout}`);
        return JSON.parse(child.stdout);
    });
    const report = {
        kind: 'gCAM core baseline; no competitor or controller measurement',
        date: new Date().toISOString(),
        runtime: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model,
        results,
    };
    const directory = new URL(
        '../../outputs/laser-benchmarks/',
        import.meta.url,
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        new URL(`run-${Date.now()}.json`, directory),
        `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
} else {
    const fixture = cases.find((c) => c.name === process.argv[requested + 1]);
    assert(fixture, 'Unknown benchmark case');
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { createLaserToolpath } = await import('../src/cam/laser.js');
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const width = 512,
        height = 512,
        data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const value = Math.round(
                255 * ((0.65 * x) / (width - 1) + (0.35 * y) / (height - 1)),
            );
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
        }
    const config = {
        operation: 'laser-raster',
        laserFeed: 3000,
        laserPower: 1000,
        laserSpot: fixture.interval,
        laserSMin: 0,
        laserSMax: 1000,
        laserGamma: 1,
        laserOverscan: 2,
        laserOptions: {
            imageMode: fixture.mode,
            scanAngle: fixture.angle ?? 0,
        },
    };
    const runs = [];
    for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const path = createLaserToolpath([], config, {
            id: fixture.name,
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: {
                        minX: 5,
                        minY: 5,
                        maxX: fixture.size + 5,
                        maxY: fixture.size + 5,
                    },
                    _imageData: { width, height, data },
                },
            ],
        });
        const planned = performance.now();
        const gcode = buildGcode({
            toolpaths: [path],
            fileName: fixture.name,
            forcePolylineArcs: true,
        });
        const emitted = performance.now();
        assert(path.laserPaths.length > 0);
        assert(gcode.includes('M4 S0') && gcode.includes('M5'));
        assert(!/G[01] Z/.test(gcode));
        runs.push({
            planningMs: planned - start,
            emissionMs: emitted - planned,
            totalMs: emitted - start,
            gcodeBytes: Buffer.byteLength(gcode),
            lines: gcode.split('\n').length,
            scanRows: path.laserPaths.length,
            previewSegments: path.laserPaths.reduce(
                (n, row) =>
                    n + row.points.slice(1).filter((p) => p.power > 0).length,
                0,
            ),
        });
    }
    console.log(
        JSON.stringify({
            ...fixture,
            sourcePixels: width * height,
            runs,
            maxProcessRssMiB: process.resourceUsage().maxRSS / 1024,
        }),
    );
}
