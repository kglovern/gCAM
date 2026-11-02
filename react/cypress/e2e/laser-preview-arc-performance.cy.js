describe('Unestimated preview worker regressions and capacity', () => {
    it('keeps linear output identical with arc-mode headers and packs complete circles', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 90000 }, async (win) => {
                const { createGcodePreviewWorker } = await win.eval(
                    "import('/src/components/gcodePreviewWorker.ts')",
                );
                async function run(code) {
                    const worker = createGcodePreviewWorker(),
                        started = win.performance.now();
                    return new Promise((resolve, reject) => {
                        worker.onerror = () => {
                            worker.terminate();
                            reject(Error('Preview worker failed'));
                        };
                        worker.onmessage = (event) => {
                            if (event.data.error) {
                                worker.terminate();
                                reject(Error(event.data.error));
                                return;
                            }
                            if (!event.data.data) return;
                            worker.terminate();
                            resolve({
                                data: event.data.data,
                                ms: win.performance.now() - started,
                                bytes: new win.TextEncoder().encode(code)
                                    .byteLength,
                            });
                        };
                        worker.postMessage({
                            gcode: code,
                            laser: true,
                            laserMax: 1000,
                        });
                    });
                }
                function hash(data) {
                    let value = 2166136261;
                    for (const chunk of data.chunks)
                        for (const buffer of [
                            chunk.positions,
                            chunk.attrs,
                            chunk.power,
                        ])
                            for (const byte of new Uint8Array(buffer)) {
                                value ^= byte;
                                value = Math.imul(value, 16777619);
                            }
                    return value >>> 0;
                }
                function summary(result) {
                    return {
                        sourceLines: new Uint32Array(
                            result.data.prefixEndVertex,
                        ).length,
                        programBytes: result.bytes,
                        workerElapsedMs: result.ms,
                        vertices: result.data.totalVertices,
                        retainedBufferBytes:
                            result.data.prefixEndVertex.byteLength +
                            result.data.chunks.reduce(
                                (sum, c) =>
                                    sum +
                                    c.positions.byteLength +
                                    c.attrs.byteLength +
                                    c.power.byteLength,
                                0,
                            ),
                    };
                }
                const lines = ['G21', 'G90', 'M4 S0'];
                for (let i = 0; i < 100000; i++)
                    lines.push(
                        'G1 X' +
                            (i % 2 ? 0 : 100) +
                            ' Y' +
                            (Math.floor(i / 2) / 10).toFixed(1) +
                            ' F12000 S500',
                    );
                lines.push('M5');
                const base = await run(lines.join('\n'));
                const mode = await run(
                    [...lines.slice(0, 2), 'G91.1', ...lines.slice(2)].join(
                        '\n',
                    ),
                );
                expect(base.data.totalVertices).equal(200000);
                const baseHash = hash(base.data),
                    modeHash = hash(mode.data);
                expect(modeHash).equal(baseHash);
                const a = new Uint32Array(base.data.prefixEndVertex),
                    b = new Uint32Array(mode.data.prefixEndVertex);
                let mismatches = 0;
                for (let i = 2; i < a.length; i++)
                    if (a[i] !== b[i + 1]) mismatches++;
                expect(mismatches).equal(0);
                const full = await run(
                    [
                        'G21 G90',
                        'G0 X10',
                        'M4 S500',
                        ...Array(1000).fill('G2 I-10 F600'),
                    ].join('\n'),
                );
                const halves = await run(
                    [
                        'G21 G90',
                        'G0 X10',
                        'M4 S500',
                        ...Array.from({ length: 1000 }, () => [
                            'G2 X-10 I-10 F600',
                            'G2 X10 I10',
                        ]).flat(),
                    ].join('\n'),
                );
                expect(full.data.totalVertices).equal(120002);
                expect(halves.data.totalVertices).equal(
                    full.data.totalVertices,
                );
                let maxDifference = 0;
                for (let i = 0; i < full.data.chunks.length; i++) {
                    const first = new Float32Array(
                            full.data.chunks[i].positions,
                        ),
                        second = new Float32Array(
                            halves.data.chunks[i].positions,
                        );
                    expect(first.length).equal(second.length);
                    for (let j = 0; j < first.length; j++)
                        maxDifference = Math.max(
                            maxDifference,
                            Math.abs(first[j] - second[j]),
                        );
                }
                expect(maxDifference).lessThan(0.00001);
                return {
                    scope: 'Actual unestimated browser workers. Current-code semantic references, not competitor or before/after performance. Dev module startup included; retained buffers are not peak memory.',
                    linear: summary(base),
                    linearWithG911: summary(mode),
                    linearHash: baseHash,
                    sourceMapMismatches: mismatches,
                    fullCircles: summary(full),
                    explicitSemicircleReference: summary(halves),
                    maxCircleCoordinateDifferenceMm: maxDifference,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-preview-arc-worker-benchmark.json',
                    report,
                ),
            );
    });
});
