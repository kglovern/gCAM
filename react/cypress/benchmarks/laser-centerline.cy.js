describe('Center-line trace worker capacity', () => {
    for (const size of [1024, 2048]) {
        it(`traces ${size} square pixels of line art without blocking the UI`, () => {
            cy.freshProject({ tools: false });
            cy.window()
                .then({ timeout: 120000 }, async (win) => {
                    const { traceBitmapInWorker } = await win.eval(
                        "import('/src/engine/cam-worker-client.ts')",
                    );
                    const { buildToolpathGcodeAsync } = await win.eval(
                        "import('/src/lib/engine.ts')",
                    );
                    const canvas = win.document.createElement('canvas');
                    canvas.width = canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, size, size);
                    ctx.fillStyle = 'black';
                    const cell = size / 16,
                        center = cell / 2,
                        half = Math.round(cell / 16),
                        stroke = half * 2 + 1,
                        margin = Math.round(cell / 6);
                    for (let y = 0; y < 16; y++)
                        for (let x = 0; x < 16; x++) {
                            ctx.fillRect(
                                x * cell + center - half,
                                y * cell + margin,
                                stroke,
                                cell - 2 * margin,
                            );
                            ctx.fillRect(
                                x * cell + margin,
                                y * cell + center - half,
                                cell - 2 * margin,
                                stroke,
                            );
                        }
                    const source = ctx.getImageData(0, 0, size, size);
                    const sha = async (text) =>
                        Array.from(
                            new Uint8Array(
                                await win.crypto.subtle.digest(
                                    'SHA-256',
                                    new win.TextEncoder().encode(text),
                                ),
                            ),
                            (b) => b.toString(16).padStart(2, '0'),
                        ).join('');
                    const trials = [];
                    let traces, geometrySha256;
                    for (let i = 0; i < 3; i++) {
                        const data = new win.Uint8ClampedArray(source.data);
                        let ticks = 0;
                        const timer = win.setInterval(() => ticks++, 5);
                        const start = win.performance.now();
                        try {
                            traces = await traceBitmapInWorker({
                                image: { width: size, height: size, data },
                                placement: {
                                    x: 0,
                                    y: 0,
                                    width: 100,
                                    height: 100,
                                },
                                options: {
                                    brightness: 0,
                                    contrast: 0,
                                    threshold: 128,
                                    invert: false,
                                    turdsize: 2,
                                    traceMode: 'centerline',
                                },
                            }).promise;
                        } finally {
                            win.clearInterval(timer);
                        }
                        trials.push({
                            milliseconds: win.performance.now() - start,
                            uiTimerCallbacks: ticks,
                        });
                        expect(ticks).to.be.greaterThan(0);
                        expect(traces).to.have.length(1024);
                        expect(
                            traces.every((path) => path.points.length === 2),
                        ).to.equal(true);
                        const hash = await sha(JSON.stringify(traces));
                        if (geometrySha256)
                            expect(hash).to.equal(geometrySha256);
                        geometrySha256 = hash;
                    }
                    const start = win.performance.now();
                    const result = await buildToolpathGcodeAsync({
                        loops: traces,
                        operation: 'laser-cut',
                        toolDiameter: 1,
                        cutDepth: 1,
                        laserFeed: 1200,
                        laserPower: 400,
                        laserOptions: { passes: 1 },
                        fileName: `centerline-${size}`,
                        arcs: false,
                    });
                    const exportMs = win.performance.now() - start;
                    expect(result.gcode).to.include('S400');
                    expect(result.gcode).not.to.match(/M6|G[01] Z/);
                    return {
                        scope: 'Actual development-server trace worker, three request-owned workers including startup, transfer, preprocessing, component filtering, thinning and geometry return; source canvas/pixel reads excluded. Export uses the real CAM/G-code worker once. No competitor/controller or peak-memory measurement.',
                        pixels: size * size,
                        fixture: '256 thick crosses; 100 x 100 mm',
                        expectedOpenPaths: 1024,
                        points: traces.reduce((n, p) => n + p.points.length, 0),
                        geometrySha256,
                        trials,
                        exportMs,
                        gcodeBytes: new win.TextEncoder().encode(result.gcode)
                            .length,
                        gcodeLines: result.gcode.split(/\r?\n/).length,
                        gcodeSha256: await sha(result.gcode),
                    };
                })
                .then((report) =>
                    cy.writeFile(
                        `../outputs/laser-centerline-worker-${size}.json`,
                        report,
                    ),
                );
        });
    }
});
