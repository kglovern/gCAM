import { hatchIslands } from '../fixtures/hatch-islands';

it('compares powered coverage, blank distance and real worker emission for repeated hatch islands', () => {
    cy.freshProject({ tools: false });
    cy.window()
        .then({ timeout: 120000 }, async (win) => {
            const { createLaserToolpath } = await win.eval(
                "import('/src/cam/laser.js')",
            );
            const { overscanFillPaths } = await win.eval(
                "import('/src/cam/scan-alignment.js')",
            );
            const { makeToolpathConfig } = await win.eval(
                "import('/src/toolpaths/toolpathRequest.ts')",
            );
            const { buildGcodeInWorker } = await win.eval(
                "import('/src/engine/cam-worker-client.ts')",
            );
            const loops = win.JSON.parse(
                JSON.stringify(hatchIslands(100, 25, 1, 1)),
            );
            const config = makeToolpathConfig({
                operation: 'laser-fill',
                toolDiameter: 1,
                cutDepth: 1,
                laserPower: 400,
                laserFeed: 2400,
                laserSpot: 0.5,
                laserOverscan: 2,
            });
            const raw = createLaserToolpath(loops, {
                ...config,
                laserOptions: { hatchOverscan: false },
            });
            const previous = {
                ...raw,
                laserOptions: { ...raw.laserOptions, hatchOverscan: true },
                laserPaths: overscanFillPaths(raw.laserPaths, 2),
            };
            const joined = createLaserToolpath(loops, config);
            const coverage = (job) =>
                job.laserPaths
                    .flatMap((path) =>
                        path.points
                            .slice(1)
                            .flatMap((p, i) =>
                                p.power > 0
                                    ? [
                                          JSON.stringify([
                                              path.points[i].x,
                                              path.points[i].y,
                                              p.x,
                                              p.y,
                                              p.power,
                                          ]),
                                      ]
                                    : [],
                            ),
                    )
                    .sort();
            const digest = async (value) =>
                Array.from(
                    new win.Uint8Array(
                        await win.crypto.subtle.digest(
                            'SHA-256',
                            new win.TextEncoder().encode(JSON.stringify(value)),
                        ),
                    ),
                    (b) => b.toString(16).padStart(2, '0'),
                ).join('');
            const originalHash = await digest(coverage(previous));
            expect(await digest(coverage(joined))).to.equal(originalHash);
            const blank = (job) => {
                let total = 0,
                    cursor = { x: 0, y: 0 };
                for (const path of job.laserPaths) {
                    total += Math.hypot(
                        path.points[0].x - cursor.x,
                        path.points[0].y - cursor.y,
                    );
                    for (let i = 1; i < path.points.length; i++) {
                        const a = path.points[i - 1],
                            b = path.points[i];
                        if (b.power === 0)
                            total += Math.hypot(b.x - a.x, b.y - a.y);
                    }
                    cursor = path.points.at(-1);
                }
                return total;
            };
            const trials = [];
            for (let repeat = 0; repeat < 3; repeat++)
                for (const [mode, job] of [
                    ['previous', previous],
                    ['joined', joined],
                ]) {
                    const controller = new win.AbortController();
                    const deadline = win.setTimeout(
                        () => controller.abort(),
                        30000,
                    );
                    let callbacks = 0;
                    const timer = win.setInterval(() => callbacks++, 5),
                        started = win.performance.now();
                    try {
                        const code = await buildGcodeInWorker({
                            toolpaths: [job],
                            fileName: 'hatch',
                            forcePolylineArcs: true,
                            signal: controller.signal,
                        });
                        trials.push({
                            repeat,
                            mode,
                            milliseconds: win.performance.now() - started,
                            bytes: new win.TextEncoder().encode(code).length,
                            rapidMoves: (code.match(/^G0 X/gm) || []).length,
                            callbacks,
                        });
                        expect(callbacks).to.be.greaterThan(0);
                    } finally {
                        win.clearTimeout(deadline);
                        win.clearInterval(timer);
                    }
                }
            const before = blank(previous),
                after = blank(joined);
            expect(after).to.be.lessThan(before * 0.2);
            expect(joined.laserPaths.length).to.equal(50);
            return {
                scope: 'Matched 100-island/50-row hatch fixture. Worker emission includes startup/cloning; source path construction, hash checks, canvas, controller rendering and actual motion excluded. Blank distance includes S0 feeds and between-path rapids from work origin.',
                poweredCoverageSha256: originalHash,
                previousPaths: previous.laserPaths.length,
                joinedPaths: joined.laserPaths.length,
                previousBlankMm: before,
                joinedBlankMm: after,
                trials,
            };
        })
        .then((result) =>
            cy.writeFile('../outputs/hatch-runs-performance.json', result),
        );
});
