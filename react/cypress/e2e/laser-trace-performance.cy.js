describe('Trace worker geometry and responsiveness', () => {
    for (const curved of [false, true]) {
        it(`compares canvas and worker tracing on 256 ${curved ? 'circular' : 'square'} rings`, () => {
            cy.freshProject({ tools: false });
            cy.window()
                .then({ timeout: 120000 }, async (win) => {
                    const { preprocessImageData, traceProcessedCanvas } =
                        await win.eval("import('/src/lib/trace.ts')");
                    const { traceBitmapInWorker } = await win.eval(
                        "import('/src/engine/cam-worker-client.ts')",
                    );
                    const canvas = win.document.createElement('canvas');
                    canvas.width = canvas.height = 1024;
                    const context = canvas.getContext('2d');
                    context.fillStyle = 'white';
                    context.fillRect(0, 0, 1024, 1024);
                    for (let y = 0; y < 16; y++)
                        for (let x = 0; x < 16; x++) {
                            context.fillStyle = 'black';
                            if (curved) {
                                context.beginPath();
                                context.arc(
                                    x * 64 + 32,
                                    y * 64 + 32,
                                    20,
                                    0,
                                    Math.PI * 2,
                                );
                                context.fill();
                            } else
                                context.fillRect(
                                    x * 64 + 8,
                                    y * 64 + 8,
                                    40,
                                    40,
                                );
                            context.fillStyle = 'white';
                            if (curved) {
                                context.beginPath();
                                context.arc(
                                    x * 64 + 32,
                                    y * 64 + 32,
                                    12,
                                    0,
                                    Math.PI * 2,
                                );
                                context.fill();
                            } else
                                context.fillRect(
                                    x * 64 + 16,
                                    y * 64 + 16,
                                    24,
                                    24,
                                );
                        }
                    const source = context.getImageData(0, 0, 1024, 1024);
                    const options = {
                        brightness: 0,
                        contrast: 0,
                        threshold: 128,
                        invert: false,
                        turdsize: 2,
                    };
                    async function measure(work) {
                        let ticks = 0,
                            active = true;
                        const timer = win.setInterval(() => {
                            if (active) ticks++;
                        }, 5);
                        const start = win.performance.now();
                        try {
                            const paths = await work();
                            const milliseconds = win.performance.now() - start;
                            active = false;
                            return {
                                paths,
                                milliseconds,
                                timerTicksDuringWork: ticks,
                                points: paths.reduce(
                                    (n, p) => n + p.points.length,
                                    0,
                                ),
                                serializedBytes: new win.TextEncoder().encode(
                                    JSON.stringify(paths),
                                ).length,
                            };
                        } finally {
                            active = false;
                            win.clearInterval(timer);
                        }
                    }
                    const legacy = await measure(() => {
                        const image = context.getImageData(0, 0, 1024, 1024);
                        preprocessImageData(image, options);
                        context.putImageData(image, 0, 0);
                        return traceProcessedCanvas(
                            canvas,
                            1024,
                            1024,
                            0,
                            0,
                            160,
                            160,
                            2,
                        );
                    });
                    context.putImageData(source, 0, 0);
                    const worker = await measure(() => {
                        const image = context.getImageData(0, 0, 1024, 1024);
                        return traceBitmapInWorker({
                            image: {
                                width: 1024,
                                height: 1024,
                                data: image.data,
                            },
                            placement: { x: 0, y: 0, width: 160, height: 160 },
                            options,
                        }).promise;
                    });
                    expect(legacy.paths.length).to.equal(512);
                    expect(worker.paths.length).to.equal(512);
                    expect(legacy.timerTicksDuringWork).to.equal(0);
                    expect(worker.timerTicksDuringWork).to.be.greaterThan(0);
                    let maxBoundsDelta = 0,
                        maxAreaDelta = 0;
                    const summary = ({ points }) => {
                        let minX = Infinity,
                            minY = Infinity,
                            maxX = -Infinity,
                            maxY = -Infinity,
                            area = 0,
                            perimeter = 0;
                        points.forEach((p, i) => {
                            minX = Math.min(minX, p.x);
                            minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x);
                            maxY = Math.max(maxY, p.y);
                            if (i) {
                                const a = points[i - 1];
                                area += (a.x * p.y - p.x * a.y) / 2;
                                perimeter += Math.hypot(p.x - a.x, p.y - a.y);
                            }
                        });
                        return {
                            bounds: [minX, minY, maxX, maxY],
                            area,
                            perimeter,
                        };
                    };
                    worker.paths.forEach((path, i) => {
                        const a = summary(legacy.paths[i]),
                            b = summary(path);
                        const delta = Math.max(
                            ...a.bounds.map((v, j) =>
                                Math.abs(v - b.bounds[j]),
                            ),
                        );
                        maxBoundsDelta = Math.max(maxBoundsDelta, delta);
                        maxAreaDelta = Math.max(
                            maxAreaDelta,
                            Math.abs(a.area - b.area),
                        );
                        expect(delta).to.be.lessThan(0.06);
                        expect(Math.sign(b.area)).to.equal(Math.sign(a.area));
                        expect(Math.abs(a.area - b.area)).to.be.lessThan(
                            a.perimeter * 0.06 + 0.01,
                        );
                    });
                    if (curved) {
                        expect(worker.points).to.be.lessThan(legacy.points);
                        expect(worker.serializedBytes).to.be.lessThan(
                            legacy.serializedBytes,
                        );
                    }
                    const { paths: legacyPaths, ...legacyMetrics } = legacy;
                    const { paths: workerPaths, ...workerMetrics } = worker;
                    const { exportProgramInWorker } = await win.eval(
                        "import('/src/engine/cam-worker-client.ts')",
                    );
                    const { DEFAULT_OUTPUT } = await win.eval(
                        "import('/src/gcode/profiles.ts')",
                    );
                    const exported = async (paths) => {
                        const start = win.performance.now();
                        const code = await exportProgramInWorker({
                            toolpaths: [
                                {
                                    operation: 'laser-cut',
                                    emission: 'laser-cut',
                                    operationLabel: 'Laser Cut',
                                    label: 'trace benchmark',
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
                            fileName: 'trace-benchmark',
                            arcs: false,
                            units: 'metric',
                            settings: DEFAULT_OUTPUT,
                        }).promise;
                        expect(code).to.include('S250');
                        expect(code).not.to.match(/M6|G[01] Z/);
                        return {
                            milliseconds: win.performance.now() - start,
                            bytes: new win.TextEncoder().encode(code).length,
                            lines: code.split(/\r?\n/).length,
                        };
                    };
                    const exportTrials = { legacy: [], worker: [] };
                    for (const name of ['legacy', 'worker', 'worker', 'legacy'])
                        exportTrials[name].push(
                            await exported(
                                name === 'legacy' ? legacyPaths : workerPaths,
                            ),
                        );
                    const summarizeExports = (trials) => {
                        expect(trials[0].bytes).to.equal(trials[1].bytes);
                        expect(trials[0].lines).to.equal(trials[1].lines);
                        return {
                            bytes: trials[0].bytes,
                            lines: trials[0].lines,
                            milliseconds:
                                (trials[0].milliseconds +
                                    trials[1].milliseconds) /
                                2,
                            trialMilliseconds: trials.map(
                                (t) => t.milliseconds,
                            ),
                        };
                    };
                    const legacyGcode = summarizeExports(exportTrials.legacy),
                        workerGcode = summarizeExports(exportTrials.worker);
                    if (curved)
                        expect(workerGcode.bytes).to.be.lessThan(
                            legacyGcode.bytes,
                        );
                    return {
                        scope: 'Same-input gCAM-only development-server browser comparison, canvas/fixed-step flattening versus isolated worker/adaptive 0.05mm chords. Both include pixel reads; worker includes startup, transfer, preprocessing and returned geometry. One trace per path; exports use two trials per path in legacy/worker/worker/legacy order with startup included. No competitor, controller or peak-memory measurement.',
                        pixels: 1048576,
                        fixture: curved ? 'circular rings' : 'square rings',
                        contours: 512,
                        maxBoundsDeltaMm: maxBoundsDelta,
                        maxAreaDeltaMm2: maxAreaDelta,
                        legacy: legacyMetrics,
                        worker: workerMetrics,
                        legacyGcode,
                        workerGcode,
                    };
                })
                .then((report) =>
                    cy.writeFile(
                        curved
                            ? '../outputs/laser-trace-curves-benchmark.json'
                            : '../outputs/laser-trace-worker-benchmark.json',
                        report,
                    ),
                );
        });
    }
});
