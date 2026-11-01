it('measures bounded heightmap conversion in its owned worker', () => {
    cy.freshProject({ tools: false });
    cy.window()
        .then({ timeout: 120000 }, async (win) => {
            const { bitmapHeightmapInWorker } = await win.eval(
                "import('/src/engine/cam-worker-client.ts')",
            );
            const trials = [];
            const gradient = win.eval(`(size) => {
                const data = new Uint8ClampedArray(size * size * 4);
                const row = new Uint8ClampedArray(size * 4);
                for (let y = 0; y < size; y++) {
                    row.fill(Math.round(y / (size - 1) * 255));
                    for (let x = 3; x < row.length; x += 4) row[x] = 255;
                    data.set(row, y * size * 4);
                }
                return data;
            }`);
            for (const size of [2000, 4000]) {
                const data = gradient(size);
                let callbacks = 0;
                const timer = win.setInterval(() => callbacks++, 5);
                const started = win.performance.now();
                const job = bitmapHeightmapInWorker({
                    image: { width: size, height: size, data },
                    widthMm: 120,
                    heightMm: 120,
                    reliefMm: 3,
                    spacingMm: 0.5,
                    invert: false,
                    fileName: 'gradient.png',
                });
                const deadline = win.setTimeout(() => job.cancel(), 30000);
                try {
                    const mesh = await job.promise;
                    trials.push({
                        sourcePixels: size * size,
                        milliseconds: win.performance.now() - started,
                        triangles: mesh.vertices.length / 9,
                        callbacks,
                    });
                    expect(mesh.vertices.length).to.equal(240 * 240 * 18);
                    expect(mesh.bounds.minZ).to.equal(0);
                    expect(mesh.bounds.maxZ).to.be.closeTo(3, 1e-8);
                    expect(mesh.vertices[2]).to.be.closeTo(3, 1e-8);
                    expect(mesh.vertices.at(-1)).to.equal(0);
                    expect(callbacks).to.be.greaterThan(0);
                } finally {
                    win.clearInterval(timer);
                    win.clearTimeout(deadline);
                }
            }
            return {
                scope: 'Owned worker startup, transferred input pixels, mesh conversion and result cloning. Excludes decode, canvas readback, source fixture creation, project serialization and CAM.',
                trials,
            };
        })
        .then((result) =>
            cy.writeFile('../outputs/heightmap-performance.json', result),
        );
});
