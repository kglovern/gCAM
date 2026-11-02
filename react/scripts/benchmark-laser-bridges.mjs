import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const median = (values) =>
    values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const names = ['small-job', 'many-parts', 'detailed-outline'];
const [mode, name] = process.argv.slice(2);
if (!mode) {
    const results = names.map((name) => {
        const samples = ['reference', 'indexed'].map((mode) => {
            const child = spawnSync(
                process.execPath,
                [fileURLToPath(import.meta.url), mode, name],
                { encoding: 'utf8', maxBuffer: 1024 * 1024 },
            );
            if (child.status !== 0) throw Error(child.stderr || child.stdout);
            return JSON.parse(child.stdout);
        });
        for (const key of [
            'anchorsSha256',
            'geometrySha256',
            'gcodeSha256',
            'gcodeBytes',
        ])
            assert.equal(samples[0][key], samples[1][key]);
        return { name, samples };
    });
    const report = {
        date: new Date().toISOString(),
        runtime: process.version,
        cpu: cpus()[0].model,
        scope: 'Fresh Node process per mode/fixture; index construction included on each lookup. One cold run, one warmup, five timed runs. Total covers lookup, gap construction and canonical two-pass G-code emission. Peak RSS is process high-water mark across repeated runs. Not browser, controller, physical or competitor evidence.',
        results,
    };
    const json = JSON.stringify(report, null, 2);
    writeFileSync(
        new URL(
            '../../outputs/laser-bridge-index-benchmark.json',
            import.meta.url,
        ),
        json,
    );
    console.log(json);
} else {
    assert(['reference', 'indexed'].includes(mode) && names.includes(name));
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { resolveManualLaserTabs } = await import(
        mode === 'reference'
            ? './fixtures/laser-bridge-reference.mjs'
            : '../src/cam/laser-bridges.js'
    );
    const { manualLaserBridges } = await import('../src/cam/laser-bridges.js');
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const [count, vertices, perPart] =
        name === 'small-job'
            ? [4, 4, 4]
            : name === 'many-parts'
              ? [64, 256, 4]
              : [1, 16384, 512];
    const paths = Array.from({ length: count }, (_, j) => ({
        points: Array.from({ length: vertices + 1 }, (_, i) => {
            const angle = ((i % vertices) * Math.PI * 2) / vertices;
            return {
                x: j * 30 + 10 * Math.cos(angle),
                y: 10 * Math.sin(angle),
                power: 400,
            };
        }),
    }));
    const tabs = paths.flatMap((path, contourIndex) =>
        Array.from({ length: perPart }, (_, i) => ({
            contourIndex,
            along: 0,
            anchor: {
                x: path.points[Math.floor(((i + 0.17) * vertices) / perPart)].x,
                y: path.points[Math.floor(((i + 0.17) * vertices) / perPart)].y,
            },
        })),
    );
    const original = hash(JSON.stringify({ paths, tabs }));
    const runs = [];
    let anchorsSha256, geometrySha256, gcodeSha256, gcodeBytes;
    for (let run = 0; run < 7; run++) {
        const start = performance.now();
        const resolved = resolveManualLaserTabs(paths, tabs);
        const lookupAt = performance.now();
        const bridged = manualLaserBridges(paths, resolved, 0.02);
        const code = buildGcode({
            fileName: name,
            forcePolylineArcs: true,
            toolpaths: [
                {
                    operation: 'laser-cut',
                    operationLabel: 'Laser Cut',
                    label: 'bridge benchmark',
                    emission: 'laser-cut',
                    laserFeed: 1200,
                    laserPower: 400,
                    laserOptions: {
                        passes: 2,
                        bridges: true,
                        bridgeMode: 'manual',
                        bridgeWidth: 0.02,
                    },
                    passDepths: [0],
                    previewContours: [],
                    laserPaths: bridged,
                },
            ],
        });
        const end = performance.now();
        if (run === 0) {
            anchorsSha256 = hash(JSON.stringify(resolved));
            geometrySha256 = hash(JSON.stringify(bridged));
            gcodeSha256 = hash(code);
            gcodeBytes = Buffer.byteLength(code);
        } else {
            assert.equal(hash(JSON.stringify(resolved)), anchorsSha256);
            assert.equal(hash(JSON.stringify(bridged)), geometrySha256);
            assert.equal(hash(code), gcodeSha256);
        }
        runs.push({ lookupMs: lookupAt - start, totalMs: end - start });
    }
    assert.equal(hash(JSON.stringify({ paths, tabs })), original);
    console.log(
        JSON.stringify({
            mode,
            contours: count,
            inputPoints: paths.reduce((n, p) => n + p.points.length, 0),
            bridges: tabs.length,
            cold: runs[0],
            medianLookupMs: median(runs.slice(2).map((r) => r.lookupMs)),
            medianTotalMs: median(runs.slice(2).map((r) => r.totalMs)),
            peakRssMiB: process.resourceUsage().maxRSS / 1024,
            anchorsSha256,
            geometrySha256,
            gcodeSha256,
            gcodeBytes,
        }),
    );
}
