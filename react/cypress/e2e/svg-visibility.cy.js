describe('SVG visibility in laser artwork', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native painted coverage for visibility, display, opacity and clone overrides', () => {
        cy.window()
            .then(async (win) => {
                const { parseSvg } = await win.eval(
                    "import('/src/engine/svg.js')",
                );
                const rect = '<rect x="8" y="8" width="20" height="16"/>';
                const cases = [
                    ['display attribute', `<g display="none">${rect}</g>`],
                    ['display inline', `<g style="display:none">${rect}</g>`],
                    [
                        'zero opacity',
                        `<g opacity="0"><g opacity="1">${rect}</g></g>`,
                    ],
                    ['negative opacity', `<g opacity="-1">${rect}</g>`],
                    ['partial opacity', `<g opacity=".2">${rect}</g>`],
                    [
                        'hidden child override',
                        `<g visibility="hidden">${rect}<rect visibility="visible" x="40" y="8" width="20" height="16"/></g>`,
                    ],
                    [
                        'important override',
                        `<g visibility="hidden" style="visibility:VISIBLE!important;visibility:hidden">${rect}</g>`,
                    ],
                    [
                        'instance override',
                        `<defs><g id="part">${rect}<rect visibility="visible" x="40" y="8" width="20" height="16"/></g></defs><use href="#part" visibility="hidden"/>`,
                    ],
                    [
                        'invalid opacity attribute',
                        `<g opacity="0broken">${rect}</g>`,
                    ],
                ];
                const report = [];
                for (const [name, body] of cases) {
                    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48">${body}</svg>`;
                    const image = new win.Image();
                    await new Promise((resolve, reject) => {
                        image.onload = resolve;
                        image.onerror = reject;
                        image.src =
                            'data:image/svg+xml;charset=utf-8,' +
                            encodeURIComponent(source);
                    });
                    const canvas = win.document.createElement('canvas');
                    canvas.width = 96;
                    canvas.height = 48;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0);
                    const native = ctx.getImageData(0, 0, 96, 48).data;
                    ctx.clearRect(0, 0, 96, 48);
                    const entities = parseSvg(source);
                    for (const entity of entities) {
                        ctx.beginPath();
                        entity.vertices.forEach((p, i) =>
                            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
                        );
                        ctx.closePath();
                        ctx.fill();
                    }
                    const imported = ctx.getImageData(0, 0, 96, 48).data;
                    let differences = 0;
                    for (let i = 3; i < native.length; i += 4)
                        if (native[i] > 0 !== imported[i] > 0) differences++;
                    expect(differences, name).equal(0);
                    report.push({
                        name,
                        entities: entities.length,
                        coverageDifferences: differences,
                    });
                    canvas.width = 0;
                }
                return {
                    scope: 'Native versus imported nonzero painted coverage; opacity is not interpreted as laser power.',
                    browser: win.navigator.userAgent,
                    report,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-svg-visibility-native.json',
                    report,
                ),
            );
    });
    it('keeps hidden artwork out of CAM and preserves visible child overrides after reload', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-visible.svg');
        cy.worldClick(10, 45);
        cy.worldClick(40, 30, { ctrlKey: true });
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            expect(p.loops.length).equal(2);
            expect(p.stack[0].toolpath.laserPaths.length).equal(2);
            const points = p.stack[0].toolpath.laserPaths.flatMap(
                (p) => p.points,
            );
            expect(
                points.every(
                    (p) => p.x >= 10 && p.x <= 50 && p.y >= 20 && p.y <= 50,
                ),
            ).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-visible-artwork-only', { capture: 'viewport' });
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
            throw Error('Visibility autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((raw) => expect(raw).equal(code));
    });
});
