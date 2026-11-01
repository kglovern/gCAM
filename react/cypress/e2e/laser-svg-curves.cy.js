describe('Mixed SVG curve import', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('retains command endpoints and matches native smooth and arc geometry', () => {
        cy.window().then(async (win) => {
            const { parseSvg } = await win.eval("import('/src/engine/svg.js')");
            const d =
                'M10 10 C12 5 18 5 20 10 S28 15 30 10 L35 10 T40 15 Q42 20 45 15 T50 15 A5 3 25 0 1 55 20 L55 25 H10 Z';
            const endpoints = [
                [10, 10],
                [20, 10],
                [30, 10],
                [35, 10],
                [40, 15],
                [45, 15],
                [50, 15],
                [55, 20],
                [55, 25],
                [10, 25],
            ];
            for (const transform of [
                '',
                'translate(3 7) rotate(20) scale(1.2 0.8)',
            ]) {
                const before =
                    win.document.querySelectorAll('body > svg').length;
                const svg = win.document.createElementNS(
                    'http://www.w3.org/2000/svg',
                    'svg',
                );
                const reference = win.document.createElementNS(
                    svg.namespaceURI,
                    'path',
                );
                reference.setAttribute('d', d);
                reference.setAttribute('transform', transform);
                svg.appendChild(reference);
                svg.style.cssText =
                    'position:absolute;left:-10000px;top:0;width:500px;height:500px;pointer-events:none';
                win.document.body.appendChild(svg);
                try {
                    const matrix = reference.getCTM();
                    const total = reference.getTotalLength();
                    const cloud = Array.from({ length: 4001 }, (_, i) =>
                        reference
                            .getPointAtLength((total * i) / 4000)
                            .matrixTransform(matrix),
                    );
                    const vertices = parseSvg(
                        `<svg xmlns="http://www.w3.org/2000/svg"><path transform="${transform}" d="${d}"/></svg>`,
                    )[0].vertices;
                    for (const [x, y] of endpoints) {
                        const expected = new win.DOMPoint(x, y).matrixTransform(
                            matrix,
                        );
                        const delta = vertices.reduce(
                            (min, p) =>
                                Math.min(
                                    min,
                                    Math.hypot(
                                        p.x - expected.x,
                                        p.y - expected.y,
                                    ),
                                ),
                            Infinity,
                        );
                        expect(
                            delta,
                            `endpoint ${x},${y}, transform ${transform}`,
                        ).to.be.lessThan(1e-5);
                    }
                    const tolerance =
                        (total / 4000) *
                            Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d) +
                        0.0001;
                    for (const vertex of vertices) {
                        const nearest = cloud.reduce(
                            (min, p) =>
                                Math.min(
                                    min,
                                    Math.hypot(p.x - vertex.x, p.y - vertex.y),
                                ),
                            Infinity,
                        );
                        expect(
                            nearest,
                            'sample lies on original native curve',
                        ).to.be.lessThan(tolerance);
                    }
                } finally {
                    svg.remove();
                }
                expect(
                    win.document.querySelectorAll('body > svg').length,
                ).to.equal(before);
            }
            const before = win.document.querySelectorAll('body > svg').length;
            let rejected;
            try {
                parseSvg(
                    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 C0 10000000000000000 10000000000000000 10000000000000000 10000000000000000 0"/></svg>',
                );
            } catch (error) {
                rejected = error.message;
            }
            expect(rejected).to.match(/precision/);
            expect(win.document.querySelectorAll('body > svg').length).to.equal(
                before,
            );
        });
    });
    it('imports a mixed contour and keeps sharp joints in laser export after reload', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-mixed-curves.svg');
        cy.worldClick(15, 30);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            const points = p.stack[0].toolpath.laserPaths[0].points;
            for (const [x, y] of [
                [30, 10],
                [35, 15],
                [35, 18],
                [28, 18],
                [28, 24],
                [35, 24],
                [35, 25],
                [30, 30],
                [10, 30],
                [5, 25],
                [5, 15],
            ])
                expect(
                    points.some(
                        (p) => Math.hypot(p.x - x, p.y - (40 - y)) < 1e-8,
                    ),
                    `exact joint ${x},${y}`,
                ).to.equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-mixed-curve-corners', { capture: 'viewport' });
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
            throw new Error('Mixed curve autosave missing');
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
