describe('Nested SVG viewport import', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native viewport matrices and percentage coordinates', () => {
        cy.window()
            .then(async (win) => {
                const { parseSvg } = await win.eval(
                    "import('/src/engine/svg.js')",
                );
                const results = [];
                for (const aspect of [
                    '',
                    'none',
                    'xMinYMin meet',
                    'xMidYMid meet',
                    'xMaxYMax meet',
                    'xMinYMin slice',
                    'xMidYMid slice',
                    'xMaxYMax slice',
                ]) {
                    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><g transform="translate(3 4) rotate(15)"><svg x="10%" y="20%" width="40%" height="30%" viewBox="10 20 20 10" preserveAspectRatio="${aspect}"><line x1="10" y1="20" x2="100%" y2="100%"/></svg></g></svg>`;
                    const svg = new win.DOMParser().parseFromString(
                        text,
                        'image/svg+xml',
                    ).documentElement;
                    win.document.body.appendChild(svg);
                    try {
                        const line = svg.querySelector('line'),
                            matrix = svg
                                .getScreenCTM()
                                .inverse()
                                .multiply(line.getScreenCTM());
                        const a = line
                                .getPointAtLength(0)
                                .matrixTransform(matrix),
                            b = line
                                .getPointAtLength(line.getTotalLength())
                                .matrixTransform(matrix);
                        const entity = parseSvg(text)[0];
                        expect(
                            Math.hypot(entity.x1 - a.x, entity.y1 - a.y),
                            `${aspect} start`,
                        ).lessThan(0.0001);
                        expect(
                            Math.hypot(entity.x2 - b.x, entity.y2 - b.y),
                            `${aspect} end`,
                        ).lessThan(0.0001);
                        results.push({
                            aspect,
                            native: [a.x, a.y, b.x, b.y],
                            actual: [
                                entity.x1,
                                entity.y1,
                                entity.x2,
                                entity.y2,
                            ],
                        });
                    } finally {
                        svg.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy.writeFile(
                    '../outputs/laser-svg-viewports-native.json',
                    results,
                ),
            );
    });
    it('keeps mapped rounded geometry through laser CAM and reload', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-viewports.svg');
        cy.worldClick(14, 65);
        cy.worldClick(63, 32.5, { ctrlKey: true });
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            const paths = p.stack[0].toolpath.laserPaths;
            expect(paths).length(2);
            const points = paths.flatMap((path) => path.points);
            for (const [x, y] of [
                [14, 10],
                [46, 10],
                [50, 14],
                [50, 26],
                [63, 42.5],
                [87, 42.5],
                [90, 45.5],
                [90, 54.5],
            ])
                expect(
                    points.some(
                        (p) => Math.hypot(p.x - x, p.y - (75 - y)) < 1e-8,
                    ),
                    `mapped tangent ${x},${y}`,
                ).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-nested-viewports', { capture: 'viewport' });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).not.match(/NaN|Infinity|M6|G[01] Z/);
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
            throw new Error('Nested SVG autosave missing');
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
