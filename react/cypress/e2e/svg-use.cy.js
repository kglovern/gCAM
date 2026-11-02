describe('SVG clones and symbols', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('matches native bounds for local shape, group, use, symbol and svg references', () => {
        cy.window()
            .then(async (win) => {
                const { parseSvg } = await win.eval(
                    "import('/src/engine/svg.js')",
                );
                const cases = [
                    [
                        'shape',
                        '<rect id="part" x="1" y="2" width="10" height="8"/>',
                        'x="10" y="20" width="99" height="88"',
                    ],
                    [
                        'group',
                        '<g id="part" transform="rotate(15)"><rect x="1" y="2" width="10" height="8"/></g>',
                        'x="10" y="20" transform="scale(2)"',
                    ],
                    [
                        'xlink',
                        '<rect id="part" x="1" y="2" width="10" height="8"/>',
                        'xlink:href="#part" x="10"',
                    ],
                    [
                        'nested-use',
                        '<rect id="p" width="10" height="8"/><use id="part" href="#p" x="7" y="9" transform="scale(2)"/>',
                        'x="10" y="20" transform="rotate(15)"',
                    ],
                    [
                        'symbol-default',
                        '<symbol id="part" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>',
                        'x="5" y="7" width="80" height="30"',
                    ],
                    [
                        'symbol-none',
                        '<symbol id="part" viewBox="10 20 20 10" preserveAspectRatio="none"><rect x="10" y="20" width="20" height="10"/></symbol>',
                        'x="10%" y="20%" width="40%" height="30%"',
                    ],
                    [
                        'symbol-size',
                        '<symbol id="part" width="40" height="20" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>',
                        'x="5" y="7"',
                    ],
                    [
                        'symbol-percent',
                        '<symbol id="part" viewBox="10 20 20 10"><rect x="10%" y="20%" width="50%" height="50%"/></symbol>',
                        'x="5" y="7" width="80" height="30"',
                    ],
                    [
                        'svg-default',
                        '<svg id="part" x="2" y="3" width="40" height="20" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>',
                        'x="5" y="7"',
                    ],
                    [
                        'svg-override',
                        '<svg id="part" x="2" y="3" width="40" height="20" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>',
                        'x="5" y="7" width="80" height="40"',
                    ],
                    [
                        'instance-percent',
                        '<svg viewBox="0 0 10 10"><rect id="part" x="10%" y="20%" width="50%" height="50%"/></svg>',
                        'x="10%" y="20%" width="1000" height="1000"',
                    ],
                    [
                        'symbol-no-viewBox',
                        '<symbol id="part"><rect width="50%" height="50%"/></symbol>',
                        'x="5" y="7" width="80" height="30"',
                    ],
                    [
                        'prefixed-symbol',
                        '<s:symbol xmlns:s="http://www.w3.org/2000/svg" id="part" viewBox="0 0 20 10"><s:rect x="10%" y="20%" width="50%" height="50%"/></s:symbol>',
                        'x="5" y="7" width="80" height="30"',
                    ],
                ];
                const results = [];
                for (const [name, defs, attrs] of cases) {
                    const text = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" viewBox="0 0 200 100"><defs transform="translate(100 100)">${defs}</defs><g transform="translate(3 4)"><use ${attrs.includes('xlink:') ? '' : 'href="#part"'} ${attrs}/></g></svg>`;
                    const svg = new win.DOMParser().parseFromString(
                        text,
                        'image/svg+xml',
                    ).documentElement;
                    win.document.body.appendChild(svg);
                    try {
                        const native = svg.getBBox(),
                            entities = parseSvg(text);
                        const points = entities.flatMap(
                            (e) =>
                                e.vertices ?? [
                                    { x: e.x1, y: e.y1 },
                                    { x: e.x2, y: e.y2 },
                                ],
                        );
                        const bounds = [
                            Math.min(...points.map((p) => p.x)),
                            Math.min(...points.map((p) => p.y)),
                            Math.max(...points.map((p) => p.x)),
                            Math.max(...points.map((p) => p.y)),
                        ];
                        const expected = [
                            native.x,
                            native.y,
                            native.x + native.width,
                            native.y + native.height,
                        ];
                        results.push({ name, expected, bounds });
                    } finally {
                        svg.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy
                    .writeFile('../outputs/laser-svg-use-native.json', results)
                    .then(() => {
                        for (const { name, expected, bounds } of results)
                            for (let i = 0; i < 4; i++)
                                expect(bounds[i], `${name} bound ${i}`).closeTo(
                                    expected[i],
                                    0.0001,
                                );
                    }),
            );
    });
    it('retains all clone outlines and holes through CAM, reload and failed import', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-clones.svg');
        for (const [i, [x, y]] of [
            [20, 10],
            [23, 20],
            [60, 10],
            [64.5, 25],
            [22.5, 45],
            [26.25, 57.5],
            [62.58819, 45.34074],
            [62.89778, 55.77646],
        ].entries())
            cy.worldClick(x, 85 - y, i ? { ctrlKey: true } : {});
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            expect(p.loops).length(8);
            const paths = p.stack[0].toolpath.laserPaths;
            expect(paths).length(8);
            const points = paths.flatMap((path) => path.points);
            for (const [x, y] of [
                [20, 10],
                [30, 15],
                [60, 10],
                [75, 17.5],
                [22.5, 45],
                [35, 51.25],
            ])
                expect(
                    points.some(
                        (p) => Math.hypot(p.x - x, p.y - (85 - y)) < 1e-8,
                    ),
                    `clone vertex ${x},${y}`,
                ).equal(true);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-clones-and-symbols', { capture: 'viewport' });
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
            throw new Error('Clone autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        let saved;
        cy.snapshot().then((p) => {
            verify(p);
            saved = p;
        });
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => expect(code).equal(exported));
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/><use href="#missing"/></svg>',
                ),
                fileName: 'missing-clone.svg',
                mimeType: 'image/svg+xml',
            },
            { force: true },
        );
        cy.contains('SVG reference #missing was not found.').should(
            'be.visible',
        );
        cy.snapshot().then((p) => {
            expect(p.loops).deep.equal(saved.loops);
            expect(p.stack).deep.equal(saved.stack);
            expect(p.fileName).equal(saved.fileName);
        });
    });
});
