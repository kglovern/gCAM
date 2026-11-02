import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const mode = process.argv[2];
if (!mode || mode === '--native-comparison') {
    const native = mode === '--native-comparison';
    const names = native
        ? ['grayscale-native', 'pass-through-native']
        : ['grayscale', 'jarvis', 'halftone', 'edge'];
    const results = names.map((name) => {
        const child = spawnSync(
            process.execPath,
            [fileURLToPath(import.meta.url), name],
            { encoding: 'utf8', windowsHide: true },
        );
        assert.equal(child.status, 0, child.stderr || child.stdout);
        return JSON.parse(child.stdout);
    });
    if (native)
        assert.equal(
            results[0].hash,
            results[1].hash,
            'Matched neutral outputs must agree byte for byte.',
        );
    console.log(
        JSON.stringify(
            {
                scope: 'gCAM processed pixels only; excludes PNG encoding, file saving, competitors and hardware',
                runtime: process.version,
                cpu: os.cpus()[0]?.model,
                fixture: native
                    ? '200 x 300 mm, 0.1 mm pitch, identical 2000 x 3000 grayscale/alpha source and output'
                    : '200 x 300 mm, 0.1 mm pitch, 6 million samples, 256 x 256 deterministic RGBA source',
                results,
            },
            null,
            2,
        ),
    );
} else {
    assert(
        [
            'grayscale',
            'jarvis',
            'halftone',
            'edge',
            'grayscale-native',
            'pass-through-native',
        ].includes(mode),
    );
    const native = mode.endsWith('-native');
    const width = native ? 2000 : 256,
        height = native ? 3000 : 256;
    globalThis.self = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Chrome', appName: 'Netscape' },
        configurable: true,
    });
    const { processLaserImage } = await import('../src/cam/laser.js');
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            data[i] = native ? (x + y * 17) % 256 : x;
            data[i + 1] = native ? data[i] : y;
            data[i + 2] = native ? data[i] : (x * 17 + y * 31) % 256;
            data[i + 3] = x % 19 === 0 ? 0 : 255;
        }
    const bitmap = {
        bounds: { minX: 0, minY: 0, maxX: 200, maxY: 300 },
        _imageData: { width, height, data },
    };
    const times = [];
    let hash, bytes;
    for (let run = 0; run < 3; run++) {
        const start = performance.now();
        const result = processLaserImage(bitmap, 0.1, native ? 1 : 1.2, {
            imageMode: native ? 'grayscale' : mode,
            passThrough: mode === 'pass-through-native',
            halftoneCellSize: 1,
        });
        times.push(Number((performance.now() - start).toFixed(2)));
        assert.equal(result.width * result.height, 6000000);
        const current = createHash('sha256').update(result.data).digest('hex');
        if (hash) assert.equal(current, hash);
        hash = current;
        bytes = result.data.byteLength;
    }
    console.log(
        JSON.stringify({
            mode,
            milliseconds: times,
            medianMs: [...times].sort((a, b) => a - b)[1],
            outputBytes: bytes,
            peakRssMiB: Number(
                (process.resourceUsage().maxRSS / 1024).toFixed(2),
            ),
            hash,
        }),
    );
}
