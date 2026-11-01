describe('Embedded SVG image import capacity', () => {
    it('measures repeated-source and baked-image imports without retaining full objects in test logs', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const { importVectorFile } = await win.eval(
                    "import('/src/lib/import.ts')",
                );
                const { serializeProject, deserializeProject } = await win.eval(
                    "import('/src/lib/project.ts')",
                );
                const canvas = win.document.createElement('canvas');
                canvas.width = 384;
                canvas.height = 192;
                const ctx = canvas.getContext('2d'),
                    pixels = ctx.createImageData(384, 192);
                for (let i = 0; i < pixels.data.length; i += 4) {
                    const x = (i / 4) % 384,
                        y = Math.floor(i / 4 / 384),
                        v = Math.max(
                            0,
                            Math.min(
                                255,
                                128 +
                                    70 * Math.sin(x / 13) +
                                    40 * Math.cos(y / 11) +
                                    ((i * 37) % 29) -
                                    14,
                            ),
                        );
                    pixels.data[i] =
                        pixels.data[i + 1] =
                        pixels.data[i + 2] =
                            v;
                    pixels.data[i + 3] = 255;
                }
                ctx.putImageData(pixels, 0, 0);
                const png = canvas.toDataURL('image/png');
                canvas.width = 0;
                const results = [];
                for (const [name, count, transform] of [
                    ['repeated source', 100, ''],
                    ['skewed source', 10, 'skewX(20)'],
                ]) {
                    const source =
                        '<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="1000mm" viewBox="0 0 1000 1000">' +
                        `<defs><image id="photo" width="40" height="20" href="${png}"/></defs>` +
                        Array.from(
                            { length: count },
                            (_, i) =>
                                `<use href="#photo" transform="translate(${10 + (i % 10) * 70} ${10 + Math.floor(i / 10) * 40}) ${transform}"/>`,
                        ).join('') +
                        '</svg>';
                    const file = new win.File([source], 'capacity.svg', {
                            type: 'image/svg+xml',
                        }),
                        runs = [];
                    for (let i = 0; i < 5; i++) {
                        const start = win.performance.now(),
                            r = await importVectorFile(file),
                            end = win.performance.now();
                        const snapshot = {
                            selected: [],
                            hidden: [],
                            stack: [],
                            guides: [],
                            fileName: 'capacity',

                            loops: r.loops.map(
                                ({ points, bitmapId, layerId }) => ({
                                    points,
                                    bitmapId,
                                    layerId,
                                }),
                            ),
                            bitmaps: r.bitmaps.map(
                                ({ img, ...bitmap }) => bitmap,
                            ),
                        };
                        const portable = serializeProject(snapshot),
                            saved = win.performance.now();
                        const expanded = JSON.stringify(
                            {
                                kind: 'gcam.project',
                                version: 2,
                                exportedAt: '',
                                fileName: 'capacity',
                                snapshot,
                            },
                            null,
                            2,
                        );
                        const restored = deserializeProject(portable);
                        expect(
                            restored.bitmaps.every(
                                (b, i) =>
                                    b.id === snapshot.bitmaps[i].id &&
                                    b.dataUrl === snapshot.bitmaps[i].dataUrl &&
                                    b.x === snapshot.bitmaps[i].x &&
                                    b.y === snapshot.bitmaps[i].y &&
                                    b.rotation === snapshot.bitmaps[i].rotation,
                            ),
                        ).equal(true);
                        if (!transform)
                            expect(portable.length).lessThan(
                                expanded.length * 0.03,
                            );
                        expect(r.bitmaps.length).equal(count);
                        expect(r.loops.length).equal(count);
                        expect(r.loops.every((l) => Boolean(l.bitmapId))).equal(
                            true,
                        );
                        expect(
                            JSON.stringify(r.loops).includes('data:image'),
                        ).equal(false);
                        runs.push({
                            importMs: end - start,
                            serializeMs: saved - end,
                            expandedBytes: new win.TextEncoder().encode(
                                expanded,
                            ).length,
                            portableBytes: new win.TextEncoder().encode(
                                portable,
                            ).length,
                            decodedPixels: r.bitmaps.reduce(
                                (n, b) =>
                                    n +
                                    b.img.naturalWidth * b.img.naturalHeight,
                                0,
                            ),
                            sourceRetained: r.bitmaps.filter(
                                (b) => b.dataUrl === png,
                            ).length,
                        });
                        await new Promise((resolve) =>
                            win.requestAnimationFrame(resolve),
                        );
                    }
                    results.push({
                        name,
                        count,
                        inputBytes: new win.TextEncoder().encode(source).length,
                        cold: runs[0],
                        warmups: 1,
                        measurements: runs.slice(2),
                        medianImportMs: runs
                            .slice(2)
                            .map((r) => r.importMs)
                            .sort((a, b) => a - b)[1],
                    });
                }
                return {
                    scope: 'Current browser SVG image import and portable project serialization, compared with expanded v2 storage of the identical placements and sources. One cold, one warmup, three measurements. Pixel counts describe placed bitmap records, not peak memory. No CAM, G-code-size, competitor or controller-throughput measurement.',
                    browser: win.navigator.userAgent,
                    date: new Date().toISOString(),
                    results,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-shared-images-browser-benchmark.json',
                    report,
                ),
            );
    });
});
