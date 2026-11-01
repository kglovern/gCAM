it('measures real-worker native RGBA flattening and physical PNG encoding', () => {
    cy.freshProject({ tools: false });
    cy.window().then({ timeout: 120000 }, async (win) => {
        const { flattenImageInWorker } = await win.eval(
            "import('/src/engine/cam-worker-client.ts')",
        );
        const { processedImagePng } = await win.eval(
            "import('/src/platform/processedImagePng.ts')",
        );
        const trials = [];
        for (const size of [1024, 2048])
            for (let repeat = 0; repeat < 3; repeat++) {
                const data = new win.Uint8ClampedArray(size * size * 4);
                for (let y = 0; y < size; y++)
                    for (let x = 0; x < size; x++) {
                        const i = (y * size + x) * 4;
                        data[i] = x % 256;
                        data[i + 1] = y % 256;
                        data[i + 2] = (x + y) % 256;
                        data[i + 3] = (x + y) % 5 ? 255 : 128;
                    }
                const outer = [
                    { x: 0.2, y: 0.2 },
                    { x: 0.8, y: 0.2 },
                    { x: 0.8, y: 0.8 },
                    { x: 0.2, y: 0.8 },
                    { x: 0.2, y: 0.2 },
                ];
                const hole = Array.from({ length: 65 }, (_, i) => ({
                    x: 0.5 + 0.125 * Math.cos(((i % 64) * 2 * Math.PI) / 64),
                    y: 0.5 + 0.125 * Math.sin(((i % 64) * 2 * Math.PI) / 64),
                }));
                let ticks = 0;
                const timer = win.setInterval(() => ticks++, 5),
                    start = win.performance.now();
                try {
                    const job = flattenImageInWorker({
                        image: { width: size, height: size, data },
                        placement: { x: 10, y: 20, w: 80, h: 80, rotation: 30 },
                        crop: {
                            left: 0.25,
                            bottom: 0.25,
                            right: 0.75,
                            top: 0.75,
                        },
                        mask: [outer, hole],
                    });
                    const result = await job.promise,
                        workerMilliseconds = win.performance.now() - start;
                    const png = await processedImagePng(result),
                        totalMilliseconds = win.performance.now() - start;
                    expect(data.byteLength).to.equal(0);
                    expect(result.width).to.equal(size / 2);
                    expect(result.height).to.equal(size / 2);
                    expect(result.widthMm).to.equal(40);
                    expect(ticks).to.be.greaterThan(0);
                    const hash = Array.from(
                        new win.Uint8Array(
                            await win.crypto.subtle.digest(
                                'SHA-256',
                                result.data,
                            ),
                        ),
                    )
                        .map((v) => v.toString(16).padStart(2, '0'))
                        .join('');
                    trials.push({
                        size,
                        repeat,
                        workerMilliseconds,
                        totalMilliseconds,
                        uiTicks: ticks,
                        hash,
                        sourceBytes: size * size * 4,
                        resultBytes: result.data.byteLength,
                        pngBytes: png.size,
                    });
                } finally {
                    win.clearInterval(timer);
                }
            }
        for (const size of [1024, 2048])
            expect(
                new Set(
                    trials.filter((t) => t.size === size).map((t) => t.hash),
                ).size,
            ).to.equal(1);
        cy.writeFile('../outputs/laser-flatten-performance.json', {
            scope: 'Actual request-owned browser workers plus native PNG encoding/pHYs metadata on 1M/4M pixel RGBA sources, 50% crop and 64-edge nested hole; three cold-worker trials per size. Includes worker startup/transfer; fixture generation and SHA-256 excluded. Byte counts are payload/PNG sizes, not measured peak memory. Excludes scene update, history, CAM, G-code, competitors and hardware.',
            trials,
        });
    });
});
