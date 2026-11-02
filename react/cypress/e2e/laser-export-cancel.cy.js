describe('Laser export cancellation', () => {
    it('terminates a running export and lets a replacement finish independently', () => {
        cy.freshProject({ tools: false });
        cy.window().then({ timeout: 120000 }, async (win) => {
            const load = (path) => win.eval(`import(${JSON.stringify(path)})`);
            const [
                { exportProgramInWorker },
                { controllerPreset },
                { exportToolpaths },
            ] = await Promise.all([
                load('/src/engine/cam-worker-client.ts'),
                load('/src/gcode/profiles.ts'),
                load('/src/gcode/exportToolpaths.ts'),
            ]);
            const NativeWorker = win.Worker;
            const workers = [];
            let started;
            const ready = new Promise((resolve) => {
                started = resolve;
            });
            win.Worker = class extends NativeWorker {
                stops = 0;
                constructor(...args) {
                    super(...args);
                    workers.push(this);
                    this.addEventListener('message', (event) => {
                        if (event.data.progress?.percent === 5) started();
                    });
                }
                terminate() {
                    this.stops++;
                    super.terminate();
                }
            };
            const request = {
                toolpaths: [
                    {
                        operation: 'laser-cut',
                        label: 'Long engraving',
                        laserFeed: 3000,
                        laserPower: 750,
                        laserSMin: 0,
                        laserSMax: 1000,
                        spindle: 12000,
                        feedRate: 3000,
                        plungeRate: 300,
                        safeZ: 5,
                        toolDiameter: 1,
                        laserOptions: { passes: 1 },
                        previewContours: [],
                        passDepths: [0],
                        laserPaths: [
                            {
                                points: Array.from(
                                    { length: 100000 },
                                    (_, i) => ({
                                        x: (i % 1000) / 10,
                                        y: Math.floor(i / 1000) / 10,
                                        power: i % 1000,
                                    }),
                                ),
                            },
                        ],
                    },
                ],
                fileName: 'cancel-test',
                arcs: false,
                units: 'metric',
                settings: controllerPreset('grblhal'),
            };
            let obsolete;
            let replacement;
            try {
                obsolete = exportProgramInWorker(request);
                const outcome = obsolete.promise.then(
                    () => 'completed',
                    (error) => error.name,
                );
                await ready;
                obsolete.cancel();
                expect(await outcome).to.equal('AbortError');
                expect(workers[0].stops).to.equal(1);
                const next = {
                    ...request,
                    toolpaths: [
                        {
                            ...request.toolpaths[0],
                            laserPaths: [
                                {
                                    points: [
                                        { x: 0, y: 0, power: 0 },
                                        { x: 10, y: 0, power: 500 },
                                    ],
                                },
                            ],
                        },
                    ],
                };
                replacement = exportProgramInWorker(next);
                const code = await replacement.promise;
                expect(
                    code ===
                        exportToolpaths(
                            next.toolpaths,
                            next.fileName,
                            next.arcs,
                            next.units,
                            next.settings,
                        ),
                    'replacement output',
                ).to.equal(true);
                expect(workers[1].stops).to.equal(1);
            } finally {
                obsolete?.cancel();
                replacement?.cancel();
                win.Worker = NativeWorker;
            }
        });
    });
});
