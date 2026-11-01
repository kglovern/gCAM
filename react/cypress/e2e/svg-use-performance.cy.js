describe('SVG clone import performance', () => {
    it('compares equivalent cloned and explicit artwork through import, CAM and export', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const { importVectorFile } = await win.eval(
                    "import('/src/lib/import.ts')",
                );
                const { createLaserToolpath } = await win.eval(
                    "import('/src/cam/laser.js')",
                );
                const { exportToolpaths } = await win.eval(
                    "import('/src/gcode/exportToolpaths.ts')",
                );
                const sha = async (text) =>
                    [
                        ...new Uint8Array(
                            await win.crypto.subtle.digest(
                                'SHA-256',
                                new win.TextEncoder().encode(text),
                            ),
                        ),
                    ]
                        .map((n) => n.toString(16).padStart(2, '0'))
                        .join('');
                const median = (values) =>
                    values.slice().sort((a, b) => a - b)[2];
                const results = [];
                const shape =
                    '<rect x="1" y="1" width="18" height="10" rx="2"/><circle cx="10" cy="6" r="2"/>';
                for (const parts of [100, 400]) {
                    const root =
                        '<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="1000mm" viewBox="0 0 1000 1000">';
                    const positions = Array.from({ length: parts }, (_, i) => ({
                        x: 10 + (i % 20) * 30,
                        y: 10 + Math.floor(i / 20) * 22,
                    }));
                    const sources = {
                        clones:
                            root +
                            `<defs><symbol id="part" viewBox="0 0 20 12">${shape}</symbol></defs>` +
                            positions
                                .map(
                                    ({ x, y }) =>
                                        `<use href="#part" x="${x}" y="${y}" width="20" height="12"/>`,
                                )
                                .join('') +
                            '</svg>',
                        explicit:
                            root +
                            positions
                                .map(
                                    ({ x, y }) =>
                                        `<svg x="${x}" y="${y}" width="20" height="12" viewBox="0 0 20 12">${shape}</svg>`,
                                )
                                .join('') +
                            '</svg>',
                    };
                    const runs = { clones: [], explicit: [] },
                        hashes = {};
                    for (let round = 0; round < 7; round++) {
                        for (const mode of round % 2
                            ? ['explicit', 'clones']
                            : ['clones', 'explicit']) {
                            const start = win.performance.now();
                            const imported = await importVectorFile(
                                new win.File([sources[mode]], 'benchmark.svg', {
                                    type: 'image/svg+xml',
                                }),
                            );
                            const importedAt = win.performance.now();
                            const toolpath = createLaserToolpath(
                                imported.loops,
                                {
                                    operation: 'laser-cut',
                                    spindle: 12000,
                                    toolDiameter: 1,
                                    feedRate: 1200,
                                    plungeRate: 300,
                                    safeZ: 5,
                                    toolNumber: 1,
                                    laserFeed: 1200,
                                    laserPower: 400,
                                    laserSpot: 0.1,
                                    laserSMin: 0,
                                    laserSMax: 1000,
                                    laserGamma: 1,
                                    laserOverscan: 0,
                                    laserOptions: {
                                        innerFirst: true,
                                        optimizeTravel: true,
                                        passes: 2,
                                    },
                                },
                            );
                            const plannedAt = win.performance.now();
                            const code = exportToolpaths(
                                [toolpath],
                                'clone-benchmark',
                                false,
                                'metric',
                            );
                            const end = win.performance.now();
                            expect(imported.loops.length).equal(parts * 2);
                            expect(toolpath.laserPaths.length).equal(parts * 2);
                            expect(/NaN|Infinity|M6|G[01] Z/.test(code)).equal(
                                false,
                            );
                            const geometry = await sha(
                                    JSON.stringify(
                                        imported.loops.map(
                                            ({ points, closed, layerId }) => ({
                                                points,
                                                closed,
                                                layerId,
                                            }),
                                        ),
                                    ),
                                ),
                                program = await sha(code);
                            if (hashes.geometry) {
                                expect(geometry).equal(hashes.geometry);
                                expect(program).equal(hashes.program);
                            } else {
                                hashes.geometry = geometry;
                                hashes.program = program;
                                hashes.gcodeBytes =
                                    new win.TextEncoder().encode(code).length;
                            }
                            runs[mode].push({
                                importMs: importedAt - start,
                                planningMs: plannedAt - importedAt,
                                formatMs: end - plannedAt,
                                totalMs: end - start,
                                vertices: imported.loops.reduce(
                                    (n, l) => n + l.points.length,
                                    0,
                                ),
                            });
                        }
                        await new Promise((resolve) =>
                            win.requestAnimationFrame(resolve),
                        );
                    }
                    const modes = {};
                    for (const mode of ['clones', 'explicit'])
                        modes[mode] = {
                            inputBytes: new win.TextEncoder().encode(
                                sources[mode],
                            ).length,
                            inputSha256: await sha(sources[mode]),
                            cold: runs[mode][0],
                            warmups: 1,
                            measurements: runs[mode].slice(2),
                            medianImportMs: median(
                                runs[mode].slice(2).map((r) => r.importMs),
                            ),
                            medianTotalMs: median(
                                runs[mode].slice(2).map((r) => r.totalMs),
                            ),
                        };
                    results.push({ parts, passes: 2, ...hashes, modes });
                }
                return {
                    scope: 'Equivalent source artwork with clones versus explicit nested SVGs; same imported geometry and byte-identical grblHAL program. One cold, one warmup, five measurements, alternating order. Browser import/CAM/formatting only; no peak-memory, competitor or controller-throughput claim.',
                    browser: win.navigator.userAgent,
                    date: new Date().toISOString(),
                    results,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-svg-use-browser-benchmark.json',
                    report,
                ),
            );
    });
});
