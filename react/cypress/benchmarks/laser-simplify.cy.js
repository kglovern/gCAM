it('measures cancellable line fitting plus real CAM/output on dense closed curves', () => {
    cy.freshProject({ tools: false });
    cy.window().then({ timeout: 120000 }, async (win) => {
        const { repairPathsInWorker } = await win.eval(
            "import('/src/engine/cam-worker-client.ts')",
        );
        const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        );
        const hash = async (text) =>
            Array.from(
                new win.Uint8Array(
                    await win.crypto.subtle.digest(
                        'SHA-256',
                        new win.TextEncoder().encode(text),
                    ),
                ),
            )
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('');
        const build = async (args, label) => {
            const controller = new win.AbortController();
            const timer = win.setTimeout(() => controller.abort(), 30000);
            try {
                return await buildToolpathGcodeAsync({
                    ...args,
                    signal: controller.signal,
                });
            } catch (error) {
                throw new Error(label + ': ' + error.message);
            } finally {
                win.clearTimeout(timer);
            }
        };
        const trials = [];
        for (const count of [20, 100]) {
            const shapes = Array.from({ length: count }, (_, n) => ({
                id: 'ring-' + n,
                points: Array.from({ length: 1001 }, (_, i) => {
                    const angle = (i === 1000 ? 0 : i / 1000) * Math.PI * 2;
                    return {
                        x: 30 + (n % 10) * 50 + 20 * Math.cos(angle),
                        y: 30 + Math.floor(n / 10) * 50 + 20 * Math.sin(angle),
                    };
                }),
            }));
            const args = {
                operation: 'laser-cut',
                toolDiameter: 0.1,
                cutDepth: 1,
                laserFeed: 1000,
                laserPower: 300,
                laserSpot: 0.1,
                arcs: false,
            };
            for (let repeat = 0; repeat < 3; repeat++) {
                let ticks = 0;
                const timer = win.setInterval(() => ticks++, 5);
                try {
                    let start = win.performance.now();
                    const baseline = await build(
                        {
                            ...args,
                            loops: shapes,
                        },
                        `${count} shapes baseline, repeat ${repeat}`,
                    );
                    const baselineMilliseconds = win.performance.now() - start;
                    start = win.performance.now();
                    const fitted = await repairPathsInWorker({
                        shapes,
                        mode: 'simplify',
                        tolerance: 0.05,
                        closure: 'line',
                    }).promise;
                    const fittingMilliseconds = win.performance.now() - start;
                    start = win.performance.now();
                    const optimized = await build(
                        {
                            ...args,
                            loops: fitted.shapes,
                        },
                        `${count} shapes optimized, repeat ${repeat}`,
                    );
                    const optimizedMilliseconds = win.performance.now() - start;
                    expect(fitted.changedIds).to.have.length(count);
                    expect(fitted.pointsAfter).to.be.lessThan(
                        fitted.pointsBefore / 5,
                    );
                    let maximumChordError = 0,
                        allClosed = true;
                    for (let n = 0; n < count; n++) {
                        const points = fitted.shapes[n].points,
                            cx = 30 + (n % 10) * 50,
                            cy = 30 + Math.floor(n / 10) * 50;
                        allClosed &&=
                            points[0].x === points.at(-1).x &&
                            points[0].y === points.at(-1).y;
                        for (let i = 1; i < points.length; i++)
                            maximumChordError = Math.max(
                                maximumChordError,
                                20 -
                                    Math.hypot(
                                        (points[i - 1].x + points[i].x) / 2 -
                                            cx,
                                        (points[i - 1].y + points[i].y) / 2 -
                                            cy,
                                    ),
                            );
                    }
                    expect(allClosed).to.equal(true);
                    expect(maximumChordError).to.be.at.most(0.05000001);
                    expect(optimized.gcode.length).to.be.lessThan(
                        baseline.gcode.length / 4,
                    );
                    expect(ticks).to.be.greaterThan(0);
                    trials.push({
                        count,
                        repeat,
                        baselineMilliseconds,
                        fittingMilliseconds,
                        optimizedMilliseconds,
                        maximumChordError,
                        sourcePoints: fitted.pointsBefore,
                        resultPoints: fitted.pointsAfter,
                        baselineBytes: new win.Blob([baseline.gcode]).size,
                        resultBytes: new win.Blob([optimized.gcode]).size,
                        uiCallbacks: ticks,
                        geometryHash: await hash(JSON.stringify(fitted.shapes)),
                        outputHash: await hash(optimized.gcode),
                    });
                } finally {
                    win.clearInterval(timer);
                }
            }
            const matching = trials.filter((t) => t.count === count);
            expect(new Set(matching.map((t) => t.geometryHash)).size).to.equal(
                1,
            );
            expect(new Set(matching.map((t) => t.outputHash)).size).to.equal(1);
        }
        cy.writeFile('../outputs/laser-simplify-performance.json', {
            scope: 'Same 20/100 dense 1000-segment circles before/after 0.05 mm line fitting. Real request-owned fitting worker and request-owned CAM/output workers, no arc fitting. Separate worker wall times include startup/message transfer; input construction, hash and scene rendering excluded. Output intentionally changes within tolerance; midpoint radial chord checks bound error independently. Blob byte counts are payload sizes, not peak memory, controller throughput or competitor timing.',
            trials,
        });
    });
});
