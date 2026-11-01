import { travelFixture } from '../fixtures/laser-travel';

it('measures real laser workers on matched 20, 200 and 500-part fixtures', () => {
    cy.freshProject({ tools: false });
    cy.window()
        .then({ timeout: 120000 }, async (win) => {
            const { createToolpathInWorker } = await win.eval(
                "import('/src/engine/cam-worker-client.ts')",
            );
            const { makeToolpathConfig } = await win.eval(
                "import('/src/toolpaths/toolpathRequest.ts')",
            );
            const { laserTravel } = await win.eval(
                "import('/src/cam/laser-order.js')",
            );
            const { orderLaserCuts: reference } = await win.eval(
                "import('/scripts/fixtures/laser-order-reference.mjs')",
            );
            const trials = [];
            for (const count of [20, 200, 500]) {
                const input = travelFixture(count);
                let callbacks = 0;
                const timer = win.setInterval(() => callbacks++, 5),
                    controller = new win.AbortController();
                const deadline = win.setTimeout(
                    () => controller.abort(),
                    30000,
                );
                const started = win.performance.now();
                try {
                    const result = await createToolpathInWorker(
                        input,
                        makeToolpathConfig({
                            operation: 'laser-cut',
                            toolDiameter: 1,
                            cutDepth: 1,
                            laserFeed: 1200,
                            laserPower: 400,
                        }),
                        { signal: controller.signal },
                    );
                    const milliseconds = win.performance.now() - started;
                    const travelMm = laserTravel(result.laserPaths);
                    const greedyMm = laserTravel(
                        reference(input, {
                            innerFirst: true,
                            optimizeTravel: true,
                        }),
                    );
                    expect(result.laserPaths.length).to.equal(count);
                    expect(travelMm).to.be.at.most(greedyMm + 1e-6);
                    expect(callbacks).to.be.greaterThan(0);
                    trials.push({
                        parts: count,
                        milliseconds,
                        travelMm,
                        greedyMm,
                        savedMm: greedyMm - travelMm,
                        callbacks,
                    });
                } finally {
                    win.clearInterval(timer);
                    win.clearTimeout(deadline);
                }
            }
            return {
                scope: 'Actual isolated toolpath worker, including startup, cloning, path preparation and local ordering. Source fixture generation, UI painting, export and actual motion excluded.',
                trials,
            };
        })
        .then((result) =>
            cy.writeFile(
                '../outputs/laser-travel-worker-performance.json',
                result,
            ),
        );
});
