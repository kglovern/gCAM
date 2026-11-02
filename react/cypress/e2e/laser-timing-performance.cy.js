describe('Native timed-preview worker capacity', () => {
    it('packs 100k moves and samples the transferred plan without retaining raw arrays in the report', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 90000 }, async (win) => {
                const { createTimeEstimateWorker } = await win.eval(
                    "import('/src/toolpaths/timeEstimateWorker.ts')",
                );
                const { createTimedPreviewCursor } = await win.eval(
                    "import('/src/components/timedPreviewCursor.ts')",
                );
                const lines = ['G21', 'G90', 'M4 S0'];
                for (let i = 0; i < 100000; i++)
                    lines.push(
                        'G1 X' +
                            (i % 2 ? 0 : 100) +
                            ' Y' +
                            (Math.floor(i / 2) / 10).toFixed(1) +
                            ' F12000 S' +
                            (i % 4 ? 1000 : 0),
                    );
                lines.push('M5');
                const code = lines.join('\n'),
                    worker = createTimeEstimateWorker(),
                    started = win.performance.now();
                return new Promise((resolve, reject) => {
                    worker.onerror = () => {
                        worker.terminate();
                        reject(Error('Timing benchmark worker failed'));
                    };
                    worker.onmessage = (event) => {
                        if (event.data.error) {
                            worker.terminate();
                            reject(Error(event.data.error));
                            return;
                        }
                        if (!event.data.result) return;
                        const elapsed = win.performance.now() - started,
                            result = event.data.result;
                        worker.terminate();
                        try {
                            const { plan, geometry } = result.preview;
                            expect(Number.isFinite(result.seconds)).equal(true);
                            expect(result.seconds).greaterThan(69900);
                            expect(result.seconds).lessThan(70100);
                            expect(plan.lineCount).equal(100004);
                            expect(geometry.totalVertices).equal(200000);
                            expect(
                                new Uint32Array(
                                    geometry.prefixEndVertex,
                                )[100003],
                            ).equal(200000);
                            const modelBytes = plan.chunks.reduce(
                                (sum, chunk) =>
                                    sum +
                                    chunk.values.byteLength +
                                    chunk.lines.byteLength,
                                0,
                            );
                            const geometryBytes =
                                geometry.prefixEndVertex.byteLength +
                                geometry.chunks.reduce(
                                    (sum, chunk) =>
                                        sum +
                                        chunk.positions.byteLength +
                                        chunk.attrs.byteLength +
                                        (chunk.power?.byteLength ?? 0),
                                    0,
                                );
                            const cursor = createTimedPreviewCursor(plan),
                                sampleStart = win.performance.now();
                            let checksum = 0;
                            for (let i = 0; i < 100000; i++)
                                checksum += cursor.sample(
                                    (result.seconds *
                                        (((i * 7919) % 100000) +
                                            (((i * 104729) % 997) + 0.5) /
                                                997)) /
                                        100000,
                                ).position.x;
                            const lookupMs =
                                win.performance.now() - sampleStart;
                            expect(checksum).greaterThan(0);
                            resolve({
                                scope: 'Actual browser worker, deterministic raster-style program; dev-server cold module startup included. Buffer bytes are retained output, not peak browser memory. No GPU/controller/competitor throughput claim.',
                                sourceLines: lines.length,
                                programBytes: new win.TextEncoder().encode(code)
                                    .byteLength,
                                workerElapsedMs: elapsed,
                                plannedBlocks: plan.blockCount,
                                modelBytes,
                                geometryBytes,
                                sampleLookups: 100000,
                                sampleLookupMs: lookupMs,
                                checksum,
                                estimatedSeconds: result.seconds,
                            });
                        } catch (error) {
                            reject(error);
                        }
                    };
                    worker.postMessage({
                        gcode: code,
                        dwell: 'P-seconds',
                        settings: {
                            maxSpeed: [20000, 20000, 3000],
                            acceleration: [1000, 1000, 200],
                            start: [0, 0, 0],
                            junctionDeviation: 0.01,
                        },
                    });
                });
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-timed-playback-worker-benchmark.json',
                    report,
                ),
            );
    });
});
