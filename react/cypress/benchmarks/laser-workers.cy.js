describe('Compiled laser worker benchmark', () => {
    for (const size of [1024, 2048]) {
        it(`checks compiled/development equality on ${size} pixel artwork`, () => {
            cy.freshProject({ tools: false });
            cy.task('compiledWorkers').then((assets) => {
                cy.window()
                    .then({ timeout: 120000 }, async (win) => {
                        const { traceBitmapInWorker, exportProgramInWorker } =
                            await win.eval(
                                "import('/src/engine/cam-worker-client.ts')",
                            );
                        const { DEFAULT_OUTPUT } = await win.eval(
                            "import('/src/gcode/profiles.ts')",
                        );
                        function compiled(asset, request, transfer = []) {
                            return new Promise((resolve, reject) => {
                                const url = win.URL.createObjectURL(
                                    new win.Blob([asset.source], {
                                        type: 'text/javascript',
                                    }),
                                );
                                const worker = new win.Worker(url, {
                                    type: 'module',
                                });
                                let settled = false;
                                const finish = (error, result) => {
                                    if (settled) return;
                                    settled = true;
                                    win.clearTimeout(timer);
                                    worker.terminate();
                                    win.URL.revokeObjectURL(url);
                                    if (error) reject(error);
                                    else resolve(result);
                                };
                                const timer = win.setTimeout(
                                    () =>
                                        finish(
                                            new Error(
                                                'Compiled worker timed out.',
                                            ),
                                        ),
                                    60000,
                                );
                                worker.addEventListener('error', (event) =>
                                    finish(new Error(event.message)),
                                );
                                worker.addEventListener('message', (event) => {
                                    const message = event.data;
                                    if (message.id !== 1 || message.progress)
                                        return;
                                    finish(
                                        message.error
                                            ? new Error(message.error)
                                            : null,
                                        message.result,
                                    );
                                });
                                try {
                                    worker.postMessage(
                                        { ...request, id: 1 },
                                        transfer,
                                    );
                                } catch (error) {
                                    finish(error);
                                }
                            });
                        }
                        const canvas = win.document.createElement('canvas');
                        canvas.width = canvas.height = size;
                        const context = canvas.getContext('2d'),
                            cell = size / 16;
                        context.fillStyle = 'white';
                        context.fillRect(0, 0, size, size);
                        for (let y = 0; y < 16; y++)
                            for (let x = 0; x < 16; x++) {
                                context.fillStyle = 'black';
                                context.beginPath();
                                context.arc(
                                    (x + 0.5) * cell,
                                    (y + 0.5) * cell,
                                    (cell * 20) / 64,
                                    0,
                                    Math.PI * 2,
                                );
                                context.fill();
                                context.fillStyle = 'white';
                                context.beginPath();
                                context.arc(
                                    (x + 0.5) * cell,
                                    (y + 0.5) * cell,
                                    (cell * 12) / 64,
                                    0,
                                    Math.PI * 2,
                                );
                                context.fill();
                            }
                        const options = {
                            brightness: 0,
                            contrast: 0,
                            threshold: 128,
                            invert: false,
                            turdsize: 2,
                        };
                        const order = [
                            'compiled',
                            'development',
                            'development',
                            'compiled',
                        ];
                        const traceSamples = { compiled: [], development: [] },
                            exportSamples = { compiled: [], development: [] };
                        let paths, traceHash;
                        const digest = async (text) =>
                            Array.from(
                                new Uint8Array(
                                    await win.crypto.subtle.digest(
                                        'SHA-256',
                                        new win.TextEncoder().encode(text),
                                    ),
                                ),
                            )
                                .map((b) => b.toString(16).padStart(2, '0'))
                                .join('');
                        for (const mode of order) {
                            let ticks = 0;
                            const interval = win.setInterval(() => ticks++, 5),
                                start = win.performance.now();
                            const pixels = context.getImageData(
                                0,
                                0,
                                size,
                                size,
                            );
                            const request = {
                                image: {
                                    width: size,
                                    height: size,
                                    data: pixels.data,
                                },
                                placement: {
                                    x: 0,
                                    y: 0,
                                    width: 160,
                                    height: 160,
                                },
                                options,
                            };
                            let result;
                            try {
                                result = await (mode === 'compiled'
                                    ? compiled(
                                          assets.trace,
                                          { ...request, type: 'trace-bitmap' },
                                          [pixels.data.buffer],
                                      )
                                    : traceBitmapInWorker(request).promise);
                            } finally {
                                win.clearInterval(interval);
                            }
                            const milliseconds = win.performance.now() - start;
                            expect(result.length).to.equal(512);
                            expect(ticks).to.be.greaterThan(0);
                            const hash = await digest(JSON.stringify(result));
                            if (traceHash) expect(hash).to.equal(traceHash);
                            else traceHash = hash;
                            paths = result;
                            traceSamples[mode].push({
                                milliseconds,
                                timerTicks: ticks,
                            });
                        }
                        const request = {
                            toolpaths: [
                                {
                                    operation: 'laser-cut',
                                    operationLabel: 'Laser Cut',
                                    emission: 'laser-cut',
                                    label: 'compiled benchmark',
                                    spindle: 0,
                                    toolDiameter: 1,
                                    feedRate: 1200,
                                    plungeRate: 300,
                                    safeZ: 5,
                                    passDepths: [0],
                                    previewContours: [],
                                    laserFeed: 1200,
                                    laserPower: 250,
                                    laserOptions: { passes: 1 },
                                    laserPaths: paths.map((p) => ({
                                        points: p.points.map((point) => ({
                                            ...point,
                                            power: 250,
                                        })),
                                    })),
                                },
                            ],
                            fileName: 'compiled-worker-benchmark',
                            arcs: false,
                            units: 'metric',
                            settings: DEFAULT_OUTPUT,
                        };
                        let outputHash, bytes, lines;
                        for (const mode of order) {
                            const start = win.performance.now();
                            const code = await (mode === 'compiled'
                                ? compiled(assets.cam, {
                                      ...request,
                                      type: 'export-program',
                                  })
                                : exportProgramInWorker(request).promise);
                            const milliseconds = win.performance.now() - start,
                                hash = await digest(code);
                            if (outputHash) expect(hash).to.equal(outputHash);
                            else outputHash = hash;
                            expect(code.includes('S250')).to.equal(true);
                            expect(/M6|G[01] Z/.test(code)).to.equal(false);
                            bytes = new win.TextEncoder().encode(code).length;
                            lines = code.split(/\r?\n/).length;
                            exportSamples[mode].push({ milliseconds });
                        }
                        const median = (trials) =>
                            trials.reduce((n, t) => n + t.milliseconds, 0) /
                            trials.length;
                        const identity = ({ name, sha256 }) => ({
                            name,
                            sha256,
                        });
                        return {
                            date: new Date().toISOString(),
                            userAgent: win.navigator.userAgent,
                            pixels: size * size,
                            contours: paths.length,
                            points: paths.reduce(
                                (n, p) => n + p.points.length,
                                0,
                            ),
                            traceHash,
                            outputHash,
                            gcodeBytes: bytes,
                            gcodeLines: lines,
                            assets: {
                                trace: identity(assets.trace),
                                cam: identity(assets.cam),
                            },
                            scope: 'Same-input compiled/development worker comparison. Compiled IIFE assets execute in fresh browser Blob workers: includes creation, parsing, transfer and returned results, excludes HTTP delivery. Development workers include local Vite module delivery. Two trials each in compiled/development/development/compiled order. No competitor, controller or peak-memory measurement.',
                            trace: {
                                compiled: {
                                    meanMs: median(traceSamples.compiled),
                                    trials: traceSamples.compiled,
                                },
                                development: {
                                    meanMs: median(traceSamples.development),
                                    trials: traceSamples.development,
                                },
                            },
                            export: {
                                compiled: {
                                    meanMs: median(exportSamples.compiled),
                                    trials: exportSamples.compiled,
                                },
                                development: {
                                    meanMs: median(exportSamples.development),
                                    trials: exportSamples.development,
                                },
                            },
                        };
                    })
                    .then((report) =>
                        cy.writeFile(
                            `../outputs/laser-compiled-workers-${size}.json`,
                            report,
                        ),
                    );
            });
        });
    }
});
