import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const median = (values) =>
    values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const names = ['detailed-outlines', 'perforated-outlines', 'nested-outlines'];
const mode = process.argv[2],
    name = process.argv[3];
if (!mode) {
    const results = names.map((name) => {
        const samples = ['reference', 'optimized'].map((mode) => {
            const child = spawnSync(
                process.execPath,
                [fileURLToPath(import.meta.url), mode, name],
                { encoding: 'utf8', maxBuffer: 1024 * 1024 },
            );
            if (child.status !== 0) throw Error(child.stderr || child.stdout);
            return JSON.parse(child.stdout);
        });
        assert.equal(samples[0].geometrySha256, samples[1].geometrySha256);
        assert.equal(samples[0].gcodeSha256, samples[1].gcodeSha256);
        assert.equal(samples[0].gcodeBytes, samples[1].gcodeBytes);
        return { name, samples };
    });
    const report = {
        date: new Date().toISOString(),
        runtime: process.version,
        cpu: cpus()[0].model,
        scope: 'Fresh process per mode/fixture; one cold run, one warmup, five timed runs. Ordering and ordering+canonical emission, not browser/worker/controller/competitor timing. Peak RSS is a repeated-run process high-water mark.',
        results,
    };
    const json = JSON.stringify(report, null, 2);
    writeFileSync(
        new URL('../../outputs/laser-ordering-benchmark.json', import.meta.url),
        json,
    );
    console.log(json);
} else {
    assert(['reference', 'optimized'].includes(mode) && names.includes(name));
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { orderLaserCuts } = await import(
        mode === 'reference'
            ? './fixtures/laser-order-reference.mjs'
            : '../src/cam/laser-order.js'
    );
    const { buildGcode } = await import('../src/cam/gcode/program.js');
    const circle = (x, y, r, n) => ({
        points: Array.from({ length: n + 1 }, (_, i) => {
            const a = ((i % n) * Math.PI * 2) / n;
            return { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
        }),
    });
    const square = (x, y) => ({
        points: [
            { x, y },
            { x: x + 20, y },
            { x: x + 20, y: y + 20 },
            { x, y: y + 20 },
            { x, y },
        ],
    });
    const count =
        name === 'detailed-outlines'
            ? 300
            : name === 'perforated-outlines'
              ? 400
              : 100;
    const paths = [];
    for (let i = 0; i < count; i++) {
        const j = (i * 37) % count,
            x = (j % 20) * 30 + 10,
            y = Math.floor(j / 20) * 30 + 10;
        if (name === 'perforated-outlines') paths.push(square(x, y));
        else {
            paths.push(circle(x, y, 8, 256));
            if (name === 'nested-outlines') paths.push(circle(x, y, 3, 32));
        }
    }
    const original = hash(JSON.stringify(paths));
    const options = {
        innerFirst: true,
        optimizeTravel: true,
        ...(name === 'perforated-outlines'
            ? { perforation: true, perforationCut: 0.2, perforationSkip: 0.1 }
            : {}),
    };
    const runs = [];
    let geometrySha256, gcodeSha256, gcodeBytes, points;
    for (let run = 0; run < 7; run++) {
        const start = performance.now(),
            ordered = orderLaserCuts(paths, options),
            orderedAt = performance.now();
        const toolpath = {
            operation: 'laser-cut',
            operationLabel: 'Laser Cut',
            label: 'ordering benchmark',
            emission: 'laser-cut',
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: { passes: 3 },
            passDepths: [0],
            previewContours: [],
            laserPaths: ordered.map((path) => ({
                points: path.points.map((p) => ({
                    ...p,
                    power: p.power === 0 ? 0 : 400,
                })),
            })),
        };
        const code = buildGcode({
            toolpaths: [toolpath],
            fileName: name,
            forcePolylineArcs: true,
        });
        const end = performance.now();
        if (run === 0) {
            geometrySha256 = hash(JSON.stringify(ordered));
            gcodeSha256 = hash(code);
            gcodeBytes = Buffer.byteLength(code);
            points = ordered.reduce((n, path) => n + path.points.length, 0);
        } else {
            assert.equal(hash(JSON.stringify(ordered)), geometrySha256);
            assert.equal(hash(code), gcodeSha256);
        }
        runs.push({ orderingMs: orderedAt - start, totalMs: end - start });
    }
    assert.equal(hash(JSON.stringify(paths)), original);
    console.log(
        JSON.stringify({
            mode,
            contours: paths.length,
            points,
            passes: 3,
            cold: runs[0],
            medianOrderingMs: median(runs.slice(2).map((r) => r.orderingMs)),
            medianOrderingAndEmissionMs: median(
                runs.slice(2).map((r) => r.totalMs),
            ),
            peakRssMiB: process.resourceUsage().maxRSS / 1024,
            gcodeBytes,
            geometrySha256,
            gcodeSha256,
        }),
    );
}
