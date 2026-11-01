import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

globalThis.self = globalThis;
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Chrome', appName: 'Netscape' },
    configurable: true,
});
const programURL = new URL('../src/cam/gcode/program.js', import.meta.url);
let source = readFileSync(programURL, 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf(
        '                        } else {\n                            const x =',
    ),
    last =
        '                            previousY = y;\n                        }',
    end = source.indexOf(last, start) + last.length;
assert(
    start >= 0 && end > start,
    'Flat emission benchmark anchor changed; update the expanded reference',
);
// Controlled reference: all non-flat code is identical; restore the previous explicit-word flat emitter.
source =
    source.slice(0, start) +
    `                        } else lines.push(\`G1 X\${formatNumber(p.x)} Y\${formatNumber(p.y)} S\${Math.round(p.power)} F\${formatNumber(feed)}\`);` +
    source.slice(end);
source = source.replace(
    /                    let previousX =[\s\S]*?previousPoint = start;\n/,
    '                    let previousPoint = start;\n',
);
source = source.replace(/from '([^']+)'/g, (all, path) =>
    path.startsWith('.')
        ? `from ${JSON.stringify(new URL(path, programURL).href)}`
        : all,
);
const folder = new URL('../../outputs/laser-benchmarks/', import.meta.url);
mkdirSync(folder, { recursive: true });
const reference = new URL(`expanded-reference-${Date.now()}.mjs`, folder);
writeFileSync(reference, source);
try {
    const [
        { createLaserToolpath },
        { buildGcode: compact },
        { buildGcode: expanded },
    ] = await Promise.all([
        import('../src/cam/laser.js'),
        import(programURL.href),
        import(reference.href),
    ]);
    const data = new Uint8ClampedArray(512 * 512 * 4);
    for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
            const i = (y * 512 + x) * 4,
                value = Math.round(255 * ((0.65 * x) / 511 + (0.35 * y) / 511));
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
        }
    const fixtures = [
        { name: 'gradient-250k', interval: 0.2, mode: 'grayscale' },
        { name: 'dither-250k', interval: 0.2, mode: 'jarvis' },
        { name: 'diagonal-1m', interval: 0.142, mode: 'atkinson', angle: 45 },
    ];
    const results = [];
    for (const fixture of fixtures) {
        const path = createLaserToolpath(
            [],
            {
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
            },
            {
                id: fixture.name,
                sourceEntities: [
                    {
                        type: 'BITMAP',
                        bounds: { minX: 5, minY: 5, maxX: 105, maxY: 105 },
                        _imageData: { width: 512, height: 512, data },
                    },
                ],
            },
        );
        const runs = { expanded: [], compact: [] };
        for (let i = 0; i < 7; i++)
            for (const name of i % 2
                ? ['compact', 'expanded']
                : ['expanded', 'compact']) {
                const start = performance.now(),
                    code = (name === 'compact' ? compact : expanded)({
                        toolpaths: [path],
                        fileName: fixture.name,
                        forcePolylineArcs: true,
                    });
                const ms = performance.now() - start,
                    bytes = Buffer.byteLength(code);
                assert(code.includes('M4 S0') && code.includes('M5'));
                if (i >= 2) runs[name].push({ ms, bytes });
            }
        const median = (items) =>
            items.map((v) => v.ms).sort((a, b) => a - b)[2];
        results.push({
            name: fixture.name,
            expandedMedianMs: median(runs.expanded),
            compactMedianMs: median(runs.compact),
            runs,
        });
    }
    const report = {
        kind: 'Same planned job, alternating expanded/compact emission; two warmups and five measurements; excludes planning, controller formatting, sender and hardware',
        date: new Date().toISOString(),
        runtime: process.version,
        cpu: os.cpus()[0]?.model,
        results,
    };
    writeFileSync(
        new URL(`emission-${Date.now()}.json`, folder),
        JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
} finally {
    unlinkSync(fileURLToPath(reference));
}
