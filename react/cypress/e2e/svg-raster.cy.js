describe('SVG appearance raster import', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('preserves native clip, mask, pattern, gradient and filter pixels with physical PNG dimensions', () => {
        cy.readFile('cypress/fixtures/laser-effects.svg')
            .then((fixture) =>
                cy.window().then(async (win) => {
                    const { rasterizeSvg } = await win.eval(
                        "import('/src/lib/svgRaster.ts')",
                    );
                    const { loadBitmapFile } = await win.eval(
                        "import('/src/lib/bitmap.ts')",
                    );
                    const cases = [
                        ['clipped masked gradient and pattern', fixture],
                        [
                            'object bounding box clip',
                            '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40"><defs><clipPath id="c" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".4"/></clipPath></defs><rect x="10" y="5" width="40" height="30" clip-path="url(#c)"/></svg>',
                        ],
                        [
                            'blur and group compositing',
                            '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40"><defs><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs><g opacity=".5" filter="url(#f)"><circle cx="24" cy="20" r="12"/><circle cx="36" cy="20" r="12"/></g></svg>',
                        ],
                        [
                            'CSS and even-odd clipping',
                            '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40"><style>.art{fill:#555;clip-path:url(#c)}</style><defs><clipPath id="c"><path clip-rule="evenodd" d="M5 5H55V35H5Z M20 10H40V30H20Z"/></clipPath></defs><rect class="art" width="60" height="40"/></svg>',
                        ],
                    ];
                    cases.push([
                        'hyperlink selectors and escaped local clipping',
                        '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40"><metadata>Example url(https://example.com/) @import</metadata><style>a[href]{fill:#333}</style><defs><clipPath id="c"><circle cx="30" cy="20" r="15"/></clipPath></defs><a href="https://example.com/"><rect width="60" height="40" clip-path="url(&quot;#c&quot;)"/></a></svg>',
                    ]);
                    const report = [];
                    for (const [name, source] of cases) {
                        const file = new win.File([source], 'effects.svg', {
                            type: 'image/svg+xml',
                        });
                        const start = win.performance.now(),
                            png = await rasterizeSvg(file, 254),
                            end = win.performance.now();
                        const bitmap = await loadBitmapFile(png, true);
                        expect(bitmap.pixelW).equal(600);
                        expect(bitmap.pixelH).equal(400);
                        expect(bitmap.physicalSize.wMm).closeTo(60, 0.001);
                        expect(bitmap.physicalSize.hMm).closeTo(40, 0.001);
                        const pixels = async (url) => {
                            const image = new win.Image();
                            await new Promise((resolve, reject) => {
                                image.onload = resolve;
                                image.onerror = reject;
                                image.src = url;
                            });
                            const canvas = win.document.createElement('canvas');
                            canvas.width = 600;
                            canvas.height = 400;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, 600, 400);
                            ctx.drawImage(image, 0, 0, 600, 400);
                            const data = ctx.getImageData(0, 0, 600, 400).data;
                            canvas.width = 0;
                            return data;
                        };
                        const native = await pixels(
                                'data:image/svg+xml;charset=utf-8,' +
                                    encodeURIComponent(source),
                            ),
                            actual = await pixels(bitmap.dataUrl);
                        let total = 0,
                            maximum = 0;
                        for (let i = 0; i < native.length; i++) {
                            const error = Math.abs(native[i] - actual[i]);
                            total += error;
                            maximum = Math.max(maximum, error);
                        }
                        report.push({
                            name,
                            pixelW: bitmap.pixelW,
                            pixelH: bitmap.pixelH,
                            wMm: bitmap.physicalSize.wMm,
                            hMm: bitmap.physicalSize.hMm,
                            meanByteError: total / native.length,
                            maximumByteError: maximum,
                            renderEncodeMs: end - start,
                            pngBytes: png.size,
                        });
                    }
                    return {
                        scope: 'Native SVG-as-image versus imported PNG, white-composited pixels. Current generation times only, no peak-memory, competitor or controller-throughput claim.',
                        browser: win.navigator.userAgent,
                        report,
                    };
                }),
            )
            .then((report) =>
                cy
                    .writeFile(
                        '../outputs/laser-svg-raster-native.json',
                        report,
                    )
                    .then(() => {
                        // PNG round-trip quantization permits small blur rounding, never more than two channel values.
                        const failures = report.report
                            .filter(
                                (r) =>
                                    !Number.isFinite(r.meanByteError) ||
                                    !Number.isFinite(r.maximumByteError) ||
                                    r.maximumByteError > 2 ||
                                    r.meanByteError >=
                                        (r.name === 'blur and group compositing'
                                            ? 0.25
                                            : 0.1),
                            )
                            .map(
                                ({
                                    name,
                                    meanByteError,
                                    maximumByteError,
                                }) => ({
                                    name,
                                    meanByteError,
                                    maximumByteError,
                                }),
                            );
                        expect(
                            failures,
                            'SVG raster comparison errors',
                        ).to.deep.equal([]);
                    }),
            );
    });
    it('imports appearance through File, generates raster CAM and reloads byte-identical output', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.menu('File', 'Open SVG as image…');
        cy.get('input[aria-label="Import SVG as image"]').selectFile(
            'cypress/fixtures/laser-effects.svg',
            { force: true },
        );
        cy.contains('h2', 'Open SVG as image').should('be.visible');
        cy.get('[aria-label="SVG image DPI"]').should('have.value', '254');
        cy.contains('button', /^Open image$/).click();
        cy.contains('button', 'Engrave image').should('be.visible').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser line interval"]')
            .type('{selectall}0.5')
            .blur();
        cy.get('[aria-label="Image mode"]').select('grayscale');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            expect(p.bitmaps.length).equal(1);
            expect(p.loops.length).equal(1);
            expect(p.stack.length).equal(1);
            expect(p.bitmaps[0].w).closeTo(60, 0.001);
            expect(p.bitmaps[0].h).closeTo(40, 0.001);
            const powers = p.stack[0].toolpath.laserPaths.flatMap((path) =>
                path.points.map((p) => p.power),
            );
            expect(powers.some((p) => p > 0 && p < 400)).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-svg-effects-raster', { capture: 'viewport' });
        let code;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((raw) => {
            code = raw;
            expect(/NaN|Infinity|M6/.test(raw)).equal(false);
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                if ((await store.load())?.snapshot.stack.length) return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Raster SVG autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((raw) => expect(raw).equal(code));
        cy.get('input[aria-label="Import SVG as image"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg"><image href="missing.png"/></svg>',
                ),
                fileName: 'external.svg',
                mimeType: 'image/svg+xml',
            },
            { force: true },
        );
        cy.contains('button', /^Open image$/).click();
        cy.get('[role="alert"]').should(
            'contain.text',
            'Embed external images',
        );
        cy.contains('button', /^Cancel$/).click();
        cy.snapshot().then(verify);
    });
});
