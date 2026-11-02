describe('Laser bounds capacity', () => {
    it('measures bounds scanning without duplicating point arrays', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then(async (win) => {
                const { laserJobBounds } = await win.eval(
                    "import('/src/cam/laser-bounds.ts')",
                );
                const points = Array.from({ length: 2000000 }, (_, i) => ({
                    x: (i % 2000) - 5,
                    y: Math.floor(i / 2000) / 10,
                    power: i % 2000 >= 5 && i % 2000 < 1995 ? 400 : 0,
                }));
                const job = {
                    operation: 'laser-raster',
                    laserPaths: [{ points }],
                };
                const runs = [];
                for (let i = 0; i < 5; i++) {
                    const start = win.performance.now(),
                        result = laserJobBounds([job]);
                    runs.push(win.performance.now() - start);
                    expect(result.travel.minX).equal(-5);
                    expect(result.travel.maxX).equal(1994);
                    expect(result.powered.minX).equal(-1);
                    expect(result.powered.maxX).equal(1989);
                    await new Promise((resolve) =>
                        win.requestAnimationFrame(resolve),
                    );
                }
                return {
                    scope: 'Current synchronous bounds scan at 2-million-point output capacity; synthetic raster-like points, not CAM generation, peak memory, competitor or controller measurements.',
                    browser: win.navigator.userAgent,
                    points: points.length,
                    coldMs: runs[0],
                    measurementsMs: runs.slice(2),
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-bounds-browser-benchmark.json',
                    report,
                ),
            );
    });
});
