describe('Deferred laser program emission', () => {
    it('benchmarks identical jobs through real workers with and without discarded programs', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const { buildToolpathGcodeAsync } = await win.eval(
                    "import('/src/lib/engine.ts')",
                );
                const { exportProgramInWorker } = await win.eval(
                    "import('/src/engine/cam-worker-client.ts')",
                );
                const { controllerPreset } = await win.eval(
                    "import('/src/gcode/profiles.ts')",
                );
                const NativeWorker = win.Worker;
                let workerCount = 0;
                win.Worker = class extends NativeWorker {
                    constructor(...args) {
                        super(...args);
                        if (String(args[0]).includes('/cam-worker'))
                            workerCount++;
                    }
                };
                const runs = { individual: [], deferred: [] },
                    cold = {};
                const data = new win.Uint8ClampedArray(
                    Array.from({ length: 64 }, (_, i) => [
                        Math.round((i * 255) / 63),
                        Math.round((i * 255) / 63),
                        Math.round((i * 255) / 63),
                        255,
                    ]).flat(),
                );
                let hash, bytes;
                try {
                    for (let round = 0; round < 4; round++)
                        for (const mode of round % 2
                            ? ['deferred', 'individual']
                            : ['individual', 'deferred']) {
                            const start = win.performance.now(),
                                beforeWorkers = workerCount,
                                toolpaths = [];
                            let discardedBytes = 0;
                            for (let index = 0; index < 3; index++) {
                                const x = index * 50;
                                const result = await buildToolpathGcodeAsync({
                                    operation: 'laser-raster',
                                    toolDiameter: 1,
                                    cutDepth: 1,
                                    loops: [
                                        {
                                            points: [
                                                { x, y: 0 },
                                                { x: x + 40, y: 0 },
                                                { x: x + 40, y: 20 },
                                                { x, y: 20 },
                                                { x, y: 0 },
                                            ],
                                        },
                                    ],
                                    bitmap: {
                                        imageData: {
                                            width: 64,
                                            height: 1,
                                            data,
                                        },
                                        bounds: {
                                            minX: x,
                                            minY: 0,
                                            maxX: x + 40,
                                            maxY: 20,
                                        },
                                    },
                                    laserFeed: 1200,
                                    laserPower: 500,
                                    laserSMax: 500,
                                    laserSMin: 0,
                                    laserGamma: 1,
                                    laserSpot: 0.05,
                                    laserOverscan: 2,
                                    laserOptions: { passes: 2 },
                                    geometryOnly: mode === 'deferred',
                                });
                                discardedBytes += result.gcode.length;
                                result.toolpath.label = `Image ${index + 1}`;
                                toolpaths.push(result.toolpath);
                            }
                            const program = await exportProgramInWorker({
                                toolpaths,
                                fileName: 'deferred-emission',
                                arcs: false,
                                units: 'metric',
                                settings: controllerPreset('grblhal'),
                            }).promise;
                            const milliseconds = win.performance.now() - start;
                            const encoded = new win.TextEncoder().encode(
                                program,
                            );
                            const digest = await win.crypto.subtle.digest(
                                'SHA-256',
                                encoded,
                            );
                            const current = Array.from(
                                new Uint8Array(digest),
                                (byte) => byte.toString(16).padStart(2, '0'),
                            ).join('');
                            if (hash) expect(current).to.equal(hash);
                            hash = current;
                            bytes = encoded.byteLength;
                            const sample = {
                                milliseconds,
                                workers: workerCount - beforeWorkers,
                                discardedBytes,
                            };
                            expect(sample.workers).to.equal(
                                mode === 'deferred' ? 4 : 7,
                            );
                            if (mode === 'deferred')
                                expect(discardedBytes).to.equal(0);
                            else
                                expect(discardedBytes).to.be.greaterThan(
                                    2000000,
                                );
                            if (round === 0) cold[mode] = sample;
                            else runs[mode].push(sample);
                        }
                } finally {
                    win.Worker = NativeWorker;
                }
                return {
                    scope: 'Real browser workers, 3 identical 40x20 mm images, 0.05 mm pitch, 64 gray levels, 2 passes; no competitor/hardware measurement',
                    userAgent: win.navigator.userAgent,
                    cold,
                    runs,
                    outputBytes: bytes,
                    hash,
                    medians: Object.fromEntries(
                        Object.entries(runs).map(([mode, samples]) => [
                            mode,
                            samples
                                .map((s) => s.milliseconds)
                                .sort((a, b) => a - b)[1],
                        ]),
                    ),
                };
            })
            .then((result) =>
                cy.writeFile(
                    '../outputs/laser-deferred-emission-browser-benchmark.json',
                    result,
                ),
            );
    });
});
