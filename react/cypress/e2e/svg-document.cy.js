describe('SVG document to CAM coordinates', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native root viewport endpoints in physical upward-Y coordinates', () => {
        cy.window()
            .then(async (win) => {
                const { importVectorFile, scaleImportResult } = await win.eval(
                    "import('/src/lib/import.ts')",
                );
                const cases = [
                    'width="101.6mm" height="50.8mm" viewBox="10 20 20 10"',
                    'width="101.6mm" height="101.6mm" viewBox="10 20 20 10"',
                    'width="101.6mm" height="101.6mm" viewBox="10 20 20 10" preserveAspectRatio="none"',
                    'width="101.6mm" height="101.6mm" viewBox="10 20 20 10" preserveAspectRatio="xMinYMin meet"',
                    'width="101.6mm" height="101.6mm" viewBox="10 20 20 10" preserveAspectRatio="xMaxYMax meet"',
                    'width="101.6mm" height="101.6mm" viewBox="10 20 20 10" preserveAspectRatio="xMidYMid slice"',
                    'width="101.6mm" height="101.6mm" viewBox="0 0 100 100" transform="translate(10 20) rotate(15)"',
                    'width="101.6mm" height="101.6mm" viewBox="0 0 100 100" transform="translate(10 20) rotate(15)" transform-origin="0 0"',
                    'width="101.6mm" height="101.6mm" viewBox="0 0 100 100" transform="rotate(15)" transform-origin="25% 75%"',
                    'width="101.6mm" height="101.6mm" viewBox="0 0 100 100" transform="rotate(15)" transform-origin="10 20"',
                    'width="101.6mm" height="101.6mm" viewBox="0 0 100 100" transform="rotate(15)" transform-origin="top right"',
                    'width="200" height="100"',
                    'width="406.4q" height="203.2q" viewBox="10 20 20 10"',
                ];
                const results = [];
                for (const attrs of cases) {
                    const source = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><g transform="translate(2 3)"><path d="M10 20L30 30"/></g></svg>`;
                    const svg = new win.DOMParser().parseFromString(
                        source,
                        'image/svg+xml',
                    ).documentElement;
                    const host = win.document.createElement('div');
                    host.style.cssText =
                        'position:absolute;left:0;top:0;pointer-events:none';
                    svg.style.display = 'block';
                    host.appendChild(svg);
                    win.document.body.appendChild(host);
                    try {
                        const anchor = host.getBoundingClientRect(),
                            height = svg.height.baseVal.value,
                            path = svg.querySelector('path'),
                            matrix = path.getScreenCTM();
                        const native = [
                            path.getPointAtLength(0),
                            path.getPointAtLength(path.getTotalLength()),
                        ]
                            .map((p) => p.matrixTransform(matrix))
                            .map((p) => ({
                                x: ((p.x - anchor.left) * 25.4) / 96,
                                y: ((height - (p.y - anchor.top)) * 25.4) / 96,
                            }));
                        const imported = await importVectorFile(
                            new win.File([source], 'frame.svg', {
                                type: 'image/svg+xml',
                            }),
                        );
                        const physical = scaleImportResult(
                            imported,
                            imported.unitScaleToMm,
                        );
                        results.push({
                            attrs,
                            origin: win.getComputedStyle(svg).transformOrigin,
                            native,
                            points: physical.loops[0].points,
                        });
                    } finally {
                        host.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy
                    .writeFile(
                        '../outputs/laser-svg-document-native.json',
                        results,
                    )
                    .then(() => {
                        for (const r of results)
                            for (let i = 0; i < 2; i++)
                                expect(
                                    Math.hypot(
                                        r.native[i].x - r.points[i].x,
                                        r.native[i].y - r.points[i].y,
                                    ),
                                    r.attrs,
                                ).lessThan(0.0001);
                    }),
            );
    });
    it('shows upright SVG artwork and preserves it through CAM, export and reload', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-svg-orientation.svg');
        cy.worldClick(25, 70);
        cy.worldClick(65, 70, { ctrlKey: true });
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
                (path) => path.points,
            );
            for (const [x, y] of [
                [10, 70],
                [40, 70],
                [40, 60],
                [35, 50],
                [35, 40],
                [10, 20],
                [65, 70],
                [80, 50],
                [70, 20],
            ])
                expect(
                    points.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-8),
                    `upright vertex ${x},${y}`,
                ).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-upright-svg', { capture: 'viewport' });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(/NaN|Infinity|M6|G[01] Z/.test(code)).equal(false);
            expect(/\bY70(?:\.0+)?(?=\s|$)/m.test(code)).equal(true);
            expect(/\bY20(?:\.0+)?(?=\s|$)/m.test(code)).equal(true);
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
            throw new Error('Upright SVG autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => expect(code).equal(exported));
    });
});
