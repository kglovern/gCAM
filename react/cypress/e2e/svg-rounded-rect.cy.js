describe('SVG rounded rectangle import', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native radius tangencies including inheritance, percentages and units', () => {
        cy.window()
            .then(async (win) => {
                const { parseSvg } = await win.eval(
                    "import('/src/engine/svg.js')",
                );
                const results = [];
                for (const attrs of [
                    'rx="2"',
                    'ry="3"',
                    'rx="0" ry="3"',
                    'rx="99" ry="99"',
                    'rx="10%"',
                    'rx="2mm"',
                    'rx="-2" ry="3"',
                ]) {
                    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><rect x="10" y="5" width="20" height="10" ${attrs}/></svg>`;
                    const svg = new win.DOMParser().parseFromString(
                        text,
                        'image/svg+xml',
                    ).documentElement;
                    win.document.body.appendChild(svg);
                    try {
                        const native =
                                svg.firstElementChild.getPointAtLength(0),
                            points = parseSvg(text)[0].vertices;
                        expect(
                            Math.hypot(
                                points[0].x - native.x,
                                points[0].y - native.y,
                            ),
                            attrs,
                        ).to.be.lessThan(0.00001);
                        results.push({
                            attrs,
                            start: points[0],
                            vertices: points.length,
                        });
                    } finally {
                        svg.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy.writeFile(
                    '../outputs/laser-rounded-rect-reference.json',
                    results,
                ),
            );
    });
    it('keeps rounded corners through laser CAM, export and project reload', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-rounded-rects.svg');
        cy.worldClick(14, 65);
        cy.worldClick(58, 65, { ctrlKey: true });
        cy.worldClick(15, 30, { ctrlKey: true });
        cy.worldClick(65, 30, { ctrlKey: true });
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
            expect(paths).to.have.length(4);
            const points = paths.flatMap((path) => path.points);
            for (const [x, y] of [
                [14, 10],
                [36, 10],
                [40, 14],
                [40, 26],
                [58, 10],
                [72, 10],
                [80, 13],
                [15, 45],
                [35, 45],
                [40, 50],
                [65, 45],
                [80, 55],
            ])
                expect(
                    points.some(
                        (p) => Math.hypot(p.x - x, p.y - (75 - y)) < 1e-8,
                    ),
                    `tangent ${x},${y}`,
                ).to.equal(true);
            for (const [x, y] of [
                [10, 10],
                [50, 10],
                [10, 45],
                [50, 45],
            ])
                expect(
                    points.some(
                        (p) => Math.hypot(p.x - x, p.y - (75 - y)) < 1e-8,
                    ),
                    `no square corner ${x},${y}`,
                ).to.equal(false);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-rounded-rectangles', { capture: 'viewport' });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).not.to.match(/NaN|Infinity|M6|G[01] Z/);
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
            throw new Error('Rounded rectangle autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
