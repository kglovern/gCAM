const circle = (id, x = 100, y = 100, count = 200) => ({
    id,
    points: Array.from({ length: count + 1 }, (_, index) => {
        const angle = index === count ? 0 : (index * Math.PI * 2) / count;
        return { x: x + 30 * Math.cos(angle), y: y + 30 * Math.sin(angle) };
    }),
});

it('generates, saves, reloads and exports fitted flat laser arcs through the real UI', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    const loops = [circle('circle')];
    const snapshot = {
        loops,
        selected: ['circle'],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'Arc fitting',
        stock: {
            widthMm: 250,
            heightMm: 200,
            thicknessMm: 3,
            material: 'sheet-goods',
            laserMaterial: 'plywood',
            origin: 'front-left',
        },
    };
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({ kind: 'gcam.project', version: 2, snapshot }),
            ),
            fileName: 'arcs.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.get('[aria-label="Laser"]').click();
    cy.contains('button', /^Laser Cut$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Cut"]', { timeout: 30000 }).should(
        'exist',
    );
    let raw, original;
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(loops);
        original = p.stack[0].toolpath;
    });
    cy.readDownload('.gcam.json').then((text) => {
        raw = text;
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.stack).to.have.length(0));
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath).to.deep.equal(original),
    );
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'saved-arcs.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.match(/G[23] .*I/);
        expect(code).to.include('S400');
        expect(code).not.to.match(/M6|G[01] Z|NaN|Infinity/);
    });
    cy.screenshot('laser-fitted-arcs', { capture: 'viewport' });
});

it('measures real worker export costs and file reduction for dense circles', () => {
    cy.freshProject({ tools: false });
    cy.window()
        .then({ timeout: 120000 }, async (win) => {
            const { createLaserToolpath } = await win.eval(
                "import('/src/cam/laser.js')",
            );
            const { makeToolpathConfig } = await win.eval(
                "import('/src/toolpaths/toolpathRequest.ts')",
            );
            const { buildGcodeInWorker } = await win.eval(
                "import('/src/engine/cam-worker-client.ts')",
            );
            const loops = Array.from({ length: 100 }, (_, index) =>
                circle(
                    String(index),
                    (index % 10) * 70,
                    Math.floor(index / 10) * 70,
                    1000,
                ),
            );
            const job = createLaserToolpath(
                loops,
                makeToolpathConfig({
                    operation: 'laser-cut',
                    toolDiameter: 1,
                    cutDepth: 1,
                    laserFeed: 1200,
                    laserPower: 400,
                }),
            );
            const original = JSON.stringify(job);
            const trials = [];
            for (let repeat = 0; repeat < 3; repeat++) {
                for (const arcs of [false, true]) {
                    let callbacks = 0;
                    const timer = win.setInterval(() => callbacks++, 5);
                    const started = win.performance.now();
                    try {
                        const code = await buildGcodeInWorker({
                            toolpaths: [job],
                            fileName: 'circles',
                            forcePolylineArcs: !arcs,
                        });
                        trials.push({
                            repeat,
                            arcs,
                            milliseconds: win.performance.now() - started,
                            bytes: new win.TextEncoder().encode(code).length,
                            arcCommands: (code.match(/^G[23] /gm) || []).length,
                            callbacks,
                        });
                        expect(code).not.to.match(/NaN|Infinity/);
                        expect(
                            arcs
                                ? code.match(/^G[23] /gm).length
                                : code.match(/^G1 [XY]/gm).length,
                        ).to.be.greaterThan(0);
                    } finally {
                        win.clearInterval(timer);
                    }
                }
            }
            expect(JSON.stringify(job)).to.equal(original);
            expect(trials[1].bytes).to.be.lessThan(trials[0].bytes / 10);
            return {
                points: 100100,
                scope: 'Actual worker startup, request/result cloning and G-code emission. Excludes source generation, canvas rendering and controller formatting.',
                trials,
            };
        })
        .then((result) =>
            cy.writeFile('../outputs/arc-fit-performance.json', result),
        );
});
