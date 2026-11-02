describe('Embedded SVG images', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native bitmap placement, transparency and transforms', () => {
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const { importVectorFile, scaleImportResult } = await win.eval(
                    "import('/src/lib/import.ts')",
                );
                const load = (url) =>
                    new Promise((resolve, reject) => {
                        const img = new win.Image();
                        img.onload = () => resolve(img);
                        img.onerror = () =>
                            reject(Error('Reference decode failed'));
                        img.src = url;
                    });
                const canvas = win.document.createElement('canvas');
                canvas.width = 8;
                canvas.height = 4;
                const ctx = canvas.getContext('2d');
                for (const [color, x, y] of [
                    ['red', 0, 0],
                    ['green', 4, 0],
                    ['blue', 0, 2],
                    ['#999', 4, 2],
                ]) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 4, 2);
                }
                const png = canvas.toDataURL('image/png'),
                    jpeg = canvas.toDataURL('image/jpeg');
                const cases = [
                    ['plain', '', png],
                    ['clone', '', png],
                    ['nestedclip', '', png],
                    [
                        'style',
                        'style="opacity:.25;opacity:.5!important;opacity:.9"',
                        png,
                    ],
                    ['jpeg', '', jpeg],
                    ['meet', 'width="30" height="25"', png],
                    [
                        'slice',
                        'width="30" height="25" preserveAspectRatio="xMidYMid slice"',
                        png,
                    ],
                    [
                        'stretch',
                        'width="30" height="25" preserveAspectRatio="none"',
                        png,
                    ],
                    ['rotate', 'transform="rotate(25 30 20)"', png],
                    ['reflect', 'transform="translate(60 0) scale(-1 1)"', png],
                    ['skew', 'transform="skewX(25)"', png],
                    ['opacity', 'opacity="0.5"', png],
                    ['root-clip', 'x="-10"', png],
                    ['intrinsic', 'width="auto" height="auto"', png],
                ];
                const reports = [];
                for (const [name, attrs, url] of cases) {
                    const base = {
                        x: '10',
                        y: '10',
                        width: '40',
                        height: '20',
                    };
                    for (const match of attrs.matchAll(/([\w-]+)="([^"]*)"/g))
                        base[match[1]] = match[2];
                    const imageMarkup = `<image ${Object.entries(base)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(' ')} href="${url}"/>`;
                    const content =
                        name === 'clone'
                            ? `<defs>${imageMarkup.replace('<image ', '<image id="photo" ')}</defs><use href="#photo"/><use href="#photo" x="45"/>`
                            : name === 'nestedclip'
                              ? `<svg x="20" y="5" width="30" height="25">${imageMarkup}</svg>`
                              : imageMarkup;
                    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="101.6mm" height="50.8mm" viewBox="0 0 100 50">${content}</svg>`;
                    let native = await load(
                        'data:image/svg+xml;charset=utf-8,' +
                            encodeURIComponent(source),
                    );
                    let reference = 'original SVG',
                        rawAutoActive;
                    if (name === 'intrinsic') {
                        const probe = win.document.createElement('canvas');
                        probe.width = 384;
                        probe.height = 192;
                        probe
                            .getContext('2d')
                            .drawImage(native, 0, 0, 384, 192);
                        rawAutoActive = probe
                            .getContext('2d')
                            .getImageData(0, 0, 384, 192)
                            .data.filter((v, i) => i % 4 === 3 && v > 0).length;
                        probe.width = 0;
                        if (!rawAutoActive) {
                            native = await load(
                                'data:image/svg+xml;charset=utf-8,' +
                                    encodeURIComponent(
                                        source
                                            .replace(
                                                'width="auto"',
                                                'width="8"',
                                            )
                                            .replace(
                                                'height="auto"',
                                                'height="4"',
                                            ),
                                    ),
                            );
                            reference =
                                'intrinsic dimensions explicitly resolved; raw Chromium SVG-image auto size was blank';
                        }
                    }
                    const result = await importVectorFile(
                        new win.File([source], 'images.svg', {
                            type: 'image/svg+xml',
                        }),
                    );
                    const p = scaleImportResult(result, result.unitScaleToMm);
                    expect(p.bitmaps.length, name).equal(
                        name === 'clone' ? 2 : 1,
                    );
                    expect(new Set(p.loops.map((l) => l.bitmapId)).size).equal(
                        p.bitmaps.length,
                    );
                    expect(p.loops[0].bitmapId).equal(p.bitmaps[0].id);
                    const a = win.document.createElement('canvas'),
                        b = win.document.createElement('canvas');
                    a.width = b.width = 384;
                    a.height = b.height = 192;
                    a.getContext('2d').drawImage(native, 0, 0, 384, 192);
                    const paint = b.getContext('2d'),
                        density = 384 / 101.6;
                    for (const bitmap of p.bitmaps) {
                        paint.save();
                        paint.translate(
                            (bitmap.x + bitmap.w / 2) * density,
                            192 - (bitmap.y + bitmap.h / 2) * density,
                        );
                        paint.rotate((-(bitmap.rotation ?? 0) * Math.PI) / 180);
                        paint.drawImage(
                            bitmap.img,
                            (-bitmap.w * density) / 2,
                            (-bitmap.h * density) / 2,
                            bitmap.w * density,
                            bitmap.h * density,
                        );
                        paint.restore();
                    }
                    const one = a
                            .getContext('2d')
                            .getImageData(0, 0, 384, 192).data,
                        two = b
                            .getContext('2d')
                            .getImageData(0, 0, 384, 192).data;
                    let sum = 0,
                        active = 0,
                        bad = 0;
                    for (let i = 0; i < one.length; i += 4) {
                        if (!one[i + 3] && !two[i + 3]) continue;
                        active++;
                        let maximum = 0;
                        for (let c = 0; c < 4; c++) {
                            const d = Math.abs(
                                c === 3
                                    ? one[i + c] - two[i + c]
                                    : (one[i + c] * one[i + 3]) / 255 -
                                          (two[i + c] * two[i + 3]) / 255,
                            );
                            sum += d;
                            maximum = Math.max(maximum, d);
                        }
                        if (maximum > 12) bad++;
                    }
                    reports.push({
                        name,
                        reference,
                        rawAutoActive,
                        meanError: sum / (active * 4),
                        badFraction: bad / active,
                        active,
                        pixels: [
                            p.bitmaps[0].img.naturalWidth,
                            p.bitmaps[0].img.naturalHeight,
                        ],
                        retainedSource: p.bitmaps[0].dataUrl === url,
                    });
                    a.width = b.width = 0;
                }
                return reports;
            })
            .then((reports) =>
                cy
                    .writeFile(
                        '../outputs/laser-svg-images-native.json',
                        reports,
                    )
                    .then(() => {
                        // Nested clipping adds resampling: allow 1% channel error and 5% AA outliers there only.
                        const failures = reports
                            .filter(
                                (r) =>
                                    !Number.isFinite(r.meanError) ||
                                    !Number.isFinite(r.badFraction) ||
                                    r.meanError >=
                                        (r.name === 'nestedclip'
                                            ? 255 * 0.01
                                            : 2) ||
                                    r.badFraction >=
                                        (r.name === 'nestedclip' ? 0.05 : 0.04),
                            )
                            .map(({ name, meanError, badFraction }) => ({
                                name,
                                meanError,
                                badFraction,
                            }));
                        expect(
                            failures,
                            'SVG image comparison errors',
                        ).to.deep.equal([]);
                        expect(
                            reports.find((r) => r.name === 'plain')
                                .retainedSource,
                        ).equal(true);
                        expect(
                            reports.find((r) => r.name === 'plain').pixels,
                        ).deep.equal([8, 4]);
                    }),
            );
    });
    it('imports a mixed job, engraves the bitmap and cuts its border, then reloads identically', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-embedded.svg');
        cy.worldClick(10.16, 30.48);
        cy.contains('button', /^Laser Raster$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser line interval"]')
            .type('{selectall}0.5')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.worldClick(30, 45);
        cy.worldClick(8.128, 30.48);
        cy.contains('button', /^Laser Cut$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            expect(p.bitmaps.length).equal(1);
            expect(p.loops.length).equal(2);
            expect(p.stack.length).equal(2);
            const image = p.bitmaps[0];
            expect(image.x).closeTo(10.16, 1e-8);
            expect(image.y).closeTo(20.32, 1e-8);
            expect(image.w).closeTo(40.64, 1e-8);
            expect(image.h).closeTo(20.32, 1e-8);
            expect(p.loops.some((l) => l.bitmapId === image.id)).equal(true);
            expect(JSON.stringify(p.loops).includes('data:image')).equal(false);
            const raster = p.stack.find(
                (e) => e.toolpath.operation === 'laser-raster',
            ).toolpath;
            expect(
                raster.laserPaths.some((path) =>
                    path.points.some((point) => point.power === 400),
                ),
            ).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-embedded-image-and-border', {
            capture: 'viewport',
        });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(/NaN|Infinity|M6|G[01] Z/.test(code)).equal(false);
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                if ((await store.load())?.snapshot.stack.length === 2) return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Mixed SVG autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => expect(code).equal(exported));
        let saved;
        cy.snapshot().then((p) => {
            saved = p;
        });
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/><image href="data:image/png;base64,bad"/></svg>',
                ),
                fileName: 'bad.svg',
                mimeType: 'image/svg+xml',
            },
            { force: true },
        );
        cy.contains('Could not decode an embedded SVG image.').should(
            'be.visible',
        );
        cy.snapshot().then((p) => {
            expect(p.bitmaps).deep.equal(saved.bitmaps);
            expect(p.loops).deep.equal(saved.loops);
            expect(p.stack).deep.equal(saved.stack);
        });
    });
    it('replaces bitmap assets with a vector-only drawing and restores them with undo', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-embedded.svg');
        cy.snapshot().then((p) => expect(p.bitmaps.length).equal(1));
        cy.importDesign('vectors.svg');
        cy.snapshot().then((p) => {
            expect(p.bitmaps.length).equal(0);
            expect(p.loops.length).equal(3);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps.length).equal(1);
            expect(p.loops.length).equal(2);
        });
    });
    it('saves repeated image data once and restores independent copies through import and recovery', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.readFile('cypress/fixtures/laser-embedded.svg').then((source) => {
            const image = source.match(/<image[^>]*\/>/)[0];
            const copies = source.replace(
                '</g>',
                image.replace('x="10"', 'x="55"') + '</g>',
            );
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(copies),
                    fileName: 'copies.svg',
                    mimeType: 'image/svg+xml',
                },
                { force: true },
            );
        });
        cy.contains('copies.svg:').should('contain.text', 'shapes');
        let portable, expected;
        cy.snapshot().then((p) => {
            expected = p.bitmaps;
            expect(expected.length).equal(2);
            expect(expected[0].id).not.equal(expected[1].id);
            expect(expected[0].x).not.equal(expected[1].x);
            expect(expected[0].dataUrl).equal(expected[1].dataUrl);
        });
        cy.readDownload('.gcam.json').then((raw) => {
            portable = raw;
            const doc = JSON.parse(raw);
            expect(doc.version).equal(3);
            expect(doc.bitmapSources.length).equal(1);
            expect(
                doc.snapshot.bitmaps.every(
                    (b) => b.sourceIndex === 0 && b.dataUrl === undefined,
                ),
            ).equal(true);
            cy.get('input[aria-label="Import project file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(raw),
                    fileName: 'copies.gcam.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        });
        cy.snapshot().then((p) => expect(p.bitmaps).deep.equal(expected));
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const p = (await store.load())?.snapshot;
                if (
                    p?.bitmaps.length === 2 &&
                    p.bitmaps[1].id === expected[1].id
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Shared image autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) => expect(p.bitmaps).deep.equal(expected));

        cy.screenshot('laser-shared-bitmap-sources', { capture: 'viewport' });
        cy.then(() => expect(portable.length).greaterThan(0));
    });
});
