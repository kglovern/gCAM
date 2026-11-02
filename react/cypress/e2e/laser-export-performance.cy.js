describe('Laser export responsiveness', () => {
    it('keeps identical controller output while leaving the UI event loop available', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const load = (path) =>
                    win.eval(`import(${JSON.stringify(path)})`);
                const [
                    { createLaserToolpath },
                    { exportToolpaths },
                    { laserExportPayload },
                    { exportProgramInWorker },
                    { controllerPreset },
                    { cloneHistoryData },
                    { prepareToolpathHistory },
                    { serializeProject, deserializeProject },
                ] = await Promise.all([
                    load('/src/cam/laser.js'),
                    load('/src/gcode/exportToolpaths.ts'),
                    load('/src/gcode/laserExportPayload.ts'),
                    load('/src/engine/cam-worker-client.ts'),
                    load('/src/gcode/profiles.ts'),
                    load('/src/lib/history.ts'),
                    load('/src/toolpaths/toolpathHistory.ts'),
                    load('/src/lib/project.ts'),
                ]);
                const data = new win.Uint8ClampedArray(256 * 256 * 4);
                for (let y = 0; y < 256; y++)
                    for (let x = 0; x < 256; x++) {
                        const i = (y * 256 + x) * 4;
                        data[i] = data[i + 1] = data[i + 2] = x;
                        data[i + 3] = 255;
                    }
                const config = {
                    operation: 'laser-raster',
                    laserFeed: 3000,
                    laserPower: 1000,
                    laserSpot: 0.2,
                    laserSMin: 0,
                    laserSMax: 1000,
                    laserGamma: 1,
                    laserOverscan: 2,
                    spindle: 12000,
                    feedRate: 3000,
                    plungeRate: 300,
                    safeZ: 5,
                    toolDiameter: 1,
                };
                const start = win.performance.now();
                const path = createLaserToolpath([], config, {
                    sourceEntities: [
                        {
                            type: 'BITMAP',
                            bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
                            _imageData: { width: 256, height: 256, data },
                        },
                    ],
                });
                const planningMs = win.performance.now() - start;
                const entry = {
                    id: 'benchmark',
                    label: 'Photo',
                    args: { ...config, loops: [] },
                    toolpath: path,
                    preview: path.previewContours.map((points) =>
                        win.Object.assign(new win.Object(), {
                            points,
                            variableLaserPower: true,
                        }),
                    ),
                };
                const copyStart = win.performance.now();
                cloneHistoryData([entry]);
                const historyCopyMs = win.performance.now() - copyStart;
                const preparationGaps = [];
                let preparationLast = win.performance.now();
                const preparationTimer = win.setInterval(() => {
                    const now = win.performance.now();
                    preparationGaps.push(now - preparationLast);
                    preparationLast = now;
                }, 5);
                const historyPreparationStart = win.performance.now();
                await prepareToolpathHistory([entry]);
                const historyPreparationWallMs =
                    win.performance.now() - historyPreparationStart;
                await new Promise((resolve) => win.setTimeout(resolve, 25));
                win.clearInterval(preparationTimer);
                const historyPreparationMaxGapMs = Math.max(...preparationGaps);
                expect(historyPreparationMaxGapMs).to.be.lessThan(
                    historyCopyMs,
                );
                expect(
                    cloneHistoryData([entry])[0].preview === entry.preview,
                    'shared read-only preview',
                ).to.equal(true);
                const historyTimes = [];
                for (let i = 0; i < 5; i++) {
                    const start = win.performance.now();
                    for (let j = 0; j < 20; j++) cloneHistoryData([entry]);
                    historyTimes.push((win.performance.now() - start) / 20);
                }
                const repeatedHistoryMs = historyTimes.sort((a, b) => a - b)[2];
                expect(repeatedHistoryMs).to.be.lessThan(historyCopyMs);
                const snapshot = {
                    loops: [],
                    selected: [],
                    hidden: [],
                    stack: [entry],
                    bitmaps: [],
                    guides: [],
                    fileName: 'benchmark',
                };
                const expandedStart = win.performance.now();
                const expandedProject = JSON.stringify({ snapshot }, null, 2);
                const expandedProjectMs = win.performance.now() - expandedStart;
                const savedStart = win.performance.now();
                const compactProject = serializeProject(snapshot);
                const compactProjectMs = win.performance.now() - savedStart;
                const restoredStart = win.performance.now();
                const restored = deserializeProject(compactProject);
                const restoreProjectMs = win.performance.now() - restoredStart;
                const compactProjectBytes = new win.Blob([compactProject]).size;
                const expandedProjectBytes = new win.Blob([expandedProject])
                    .size;
                expect(compactProjectBytes).to.be.lessThan(
                    expandedProjectBytes * 0.6,
                );
                expect(
                    restored.stack[0].preview[0].variableLaserPower,
                ).to.equal(true);
                expect(
                    JSON.stringify(restored.stack[0].toolpath.laserPaths) ===
                        JSON.stringify(path.laserPaths),
                    'project round-trip motion and power',
                ).to.equal(true);
                const settings = controllerPreset('grblhal');
                const gaps = [];
                let last = win.performance.now();
                const timer = win.setInterval(() => {
                    const now = win.performance.now();
                    gaps.push(now - last);
                    last = now;
                }, 5);
                const pause = () =>
                    new Promise((resolve) => win.setTimeout(resolve, 25));
                try {
                    await pause();
                    gaps.length = 0;
                    const syncStart = win.performance.now();
                    const expected = exportToolpaths(
                        [path],
                        'benchmark',
                        false,
                        'metric',
                        settings,
                    );
                    const synchronousMs = win.performance.now() - syncStart;
                    await pause();
                    const synchronousMaxGapMs = Math.max(...gaps);
                    gaps.length = 0;
                    const prepStart = win.performance.now();
                    const toolpaths = laserExportPayload([path]);
                    const payloadPreparationMs =
                        win.performance.now() - prepStart;
                    const workerStart = win.performance.now();
                    const result = await exportProgramInWorker({
                        toolpaths,
                        fileName: 'benchmark',
                        arcs: false,
                        units: 'metric',
                        settings,
                    }).promise;
                    const workerWallMs = win.performance.now() - workerStart;
                    await pause();
                    const workerMaxGapMs = Math.max(...gaps);
                    expect(
                        result === expected,
                        'byte-identical controller output',
                    ).to.equal(true);
                    expect(
                        result.includes('M4 S0'),
                        'unpowered laser start',
                    ).to.equal(true);
                    expect(workerMaxGapMs).to.be.lessThan(synchronousMaxGapMs);
                    const report = {
                        kind: 'browser export, no competitor or physical machine',
                        planningMs,
                        historyCopyMs,
                        historyPreparationWallMs,
                        repeatedHistoryMs,
                        historyPreparationMaxGapMs,
                        expandedProjectBytes,
                        compactProjectBytes,
                        expandedProjectMs,
                        compactProjectMs,
                        restoreProjectMs,
                        payloadPreparationMs,
                        synchronousMs,
                        synchronousMaxGapMs,
                        workerWallMs,
                        workerMaxGapMs,
                        gcodeBytes: new win.Blob([result]).size,
                        segments: path.laserPaths.reduce(
                            (n, row) =>
                                n +
                                row.points.slice(1).filter((p) => p.power > 0)
                                    .length,
                            0,
                        ),
                    };
                    return report;
                } finally {
                    win.clearInterval(timer);
                }
            })
            .then((report) =>
                cy.writeFile(
                    `../outputs/laser-benchmarks/browser-export-${Date.now()}.json`,
                    report,
                ),
            );
    });
});
