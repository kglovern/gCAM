import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const parserUrl = new URL('node_modules/@sienci/gviewer/dist/gviewer.js', root)
    .href;
const source = readFileSync(new URL('src/gcode/estimateTime.ts', root), 'utf8');
const compiled = ts
    .transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
    })
    .outputText.replace("'@sienci/gviewer'", JSON.stringify(parserUrl));
const fixture = `
    import assert from 'node:assert/strict';
    const baselineRss = process.memoryUsage().rss;
    const lines = ['G21', 'G90', 'M4 S0'];
    for (let i = 0; i < COUNT; i++)
        lines.push('G1 X' + (i % 2 ? 0 : 100) + ' Y' +
            (Math.floor(i / 2) / 10).toFixed(1) + ' F12000 S' + (i % 4 ? 1000 : 0));
    lines.push('M5');
    const gcode = lines.join(String.fromCharCode(10)), start = performance.now();
    const result = await estimateProgramTime(gcode, {
        maxSpeed: [20000,20000,3000], acceleration: [1000,1000,200],
        start: [0,0,0], junctionDeviation: 0.01,
    });
    const elapsedMs = performance.now() - start;
    assert(Number.isFinite(result.seconds));
    assert(result.seconds >= result.nominalSeconds);
    assert(result.distanceMm >= COUNT * 100 - 0.0001);
    assert(result.seconds > COUNT * 0.699 && result.seconds < COUNT * 0.701);
    assert.equal(result.lineEndSeconds.at(-1), result.seconds);
    for (let i = 1; i < result.lineEndSeconds.length; i++)
        assert(result.lineEndSeconds[i] >= result.lineEndSeconds[i - 1]);
    console.log(JSON.stringify({
        sourceLines: lines.length, programBytes: Buffer.byteLength(gcode), elapsedMs,
        estimatedSeconds: result.seconds, nominalSeconds: result.nominalSeconds,
        baselineRss, peakProcessRssBytes: process.resourceUsage().maxRSS * 1024,
        timelineBytes: result.lineEndSeconds.byteLength,
    }));
`;
const results = [];
for (const moves of [1000, 100000]) {
    const child = spawnSync(process.execPath, ['--input-type=module'], {
        cwd: fileURLToPath(root),
        input:
            compiled +
            String.fromCharCode(10) +
            fixture.replaceAll('COUNT', String(moves)),
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    results.push(JSON.parse(child.stdout));
}
console.log(
    JSON.stringify(
        {
            scope: 'Fresh Node processes; deterministic raster-style G-code. RSS includes Node/parser/corpus. Not browser peak, machine runtime or competitive parity.',
            results,
        },
        null,
        2,
    ),
);
