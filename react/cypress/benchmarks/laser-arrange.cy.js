it('measures real-worker arrangement of large grouped selections', () => {
    cy.freshProject({ tools: false });
    cy.window().then({ timeout: 120000 }, async (win) => {
        const { arrangeArtworkInWorker } = await win.eval(
            "import('/src/engine/cam-worker-client.ts')",
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
        const trials = [];
        for (const units of [500, 2500]) {
            const shapes = Array.from({ length: units }, (_, n) =>
                [0, 1].map((hole) => {
                    const x = n * 20 + (n % 7) * 0.7 + hole * 2,
                        y = hole * 2,
                        size = hole ? 6 : 10;
                    return {
                        id: `${n}-${hole}`,
                        groupId: 'group-' + n,
                        points: Array.from({ length: 101 }, (_, i) => {
                            const side = Math.floor((i % 100) / 25),
                                t = (((i % 100) % 25) / 25) * size;
                            return [
                                { x: x + t, y },
                                { x: x + size, y: y + t },
                                { x: x + size - t, y: y + size },
                                { x, y: y + size - t },
                            ][side];
                        }),
                    };
                }),
            ).flat();
            const source = {
                shapes,
                order: shapes.map((s) => s.id),
                bitmaps: [],
            };
            for (let repeat = 0; repeat < 3; repeat++) {
                let uiCallbacks = 0;
                const timer = win.setInterval(() => uiCallbacks++, 5),
                    started = win.performance.now();
                const job = arrangeArtworkInWorker(source, 'spaceX'),
                    deadline = win.setTimeout(() => job.cancel(), 30000);
                try {
                    const result = await job.promise,
                        milliseconds = win.performance.now() - started;
                    expect(result.units).to.equal(units);
                    expect(result.movedUnits).to.be.greaterThan(units / 2);
                    let maxPositionError = 0,
                        maxHoleError = 0;
                    const first = shapes[0].points[0].x,
                        last = shapes[shapes.length - 2].points[0].x,
                        step = (last - first) / (units - 1);
                    for (let n = 0; n < units; n++) {
                        maxPositionError = Math.max(
                            maxPositionError,
                            Math.abs(
                                result.shapes[n * 2].points[0].x -
                                    first -
                                    n * step,
                            ),
                        );
                        maxHoleError = Math.max(
                            maxHoleError,
                            Math.abs(
                                result.shapes[n * 2 + 1].points[0].x -
                                    result.shapes[n * 2].points[0].x -
                                    2,
                            ),
                        );
                    }
                    expect(maxPositionError).to.be.lessThan(1e-7);
                    expect(maxHoleError).to.be.lessThan(1e-7);
                    expect(uiCallbacks).to.be.greaterThan(0);
                    trials.push({
                        units,
                        shapes: shapes.length,
                        sourcePoints: shapes.length * 101,
                        repeat,
                        milliseconds,
                        uiCallbacks,
                        maxPositionError,
                        maxHoleError,
                        geometryHash: await hash(JSON.stringify(result.shapes)),
                    });
                } finally {
                    win.clearInterval(timer);
                    win.clearTimeout(deadline);
                }
            }
            expect(
                new Set(
                    trials
                        .filter((t) => t.units === units)
                        .map((t) => t.geometryHash),
                ).size,
            ).to.equal(1);
        }
        cy.writeFile('../outputs/laser-arrange-performance.json', {
            scope: 'Real request-owned artwork worker: equal X-gap distribution of 500/2500 two-contour groups with 101 points per contour. Wall time includes worker startup and request/result cloning; fixture creation, hashing, canvas painting, history/commit and source capture excluded. Independent expected positions/hole offsets and repeated geometry hashes checked. Point counts are not peak memory or competitor/controller measurements.',
            trials,
        });
    });
});
