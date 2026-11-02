it('V-carves outline lettering with tapered corners, clear counters and full stroke coverage', () => {
    cy.freshProject();
    cy.viewport(1280, 720);
    let project;
    cy.window().then({ timeout: 120000 }, async (win) => {
        const { outlineTextLoops } = await win.eval(
            "import('/src/draw/textGeometry.ts')",
        );
        const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        );
        const { previewFor } = await win.eval(
            "import('/src/toolpaths/useToolpathStack.ts')",
        );
        const { buildCutDepthPreview } = await win.eval(
            "import('/src/lib/cut-depth-preview.ts')",
        );
        const loops = [],
            stack = [];
        for (const [index, row] of [
            { text: 'V CARVE', font: 'anton', height: 48, y: 65 },
            { text: 'ABO 123', font: 'space-mono', height: 36, y: 20 },
        ].entries()) {
            const parts = (
                await outlineTextLoops(
                    row.text,
                    { x: 12, y: row.y },
                    row.height,
                    row.font,
                )
            ).map((l, i) => ({
                ...l,
                id: `text-${index}-${i}`,
                groupId: `text-${index}`,
            }));
            loops.push(...parts);
            const args = {
                operation: 'vcarve',
                loops: parts,
                toolDiameter: 20,
                cutterAngle: 90,
                cutterType: 'v-bit',
                cutDepth: 10,
                passDepth: 4,
                feedRate: 1000,
                plungeRate: 300,
                spindle: 18000,
                safeZ: 5,
                toolNumber: 1,
                stockThicknessMm: 18,
            };
            const result = await buildToolpathGcodeAsync({
                ...args,
                geometryOnly: true,
            });
            stack.push({
                id: `text-job-${index}`,
                label: `${row.font}: ${row.text}`,
                args,
                toolpath: result.toolpath,
                preview: previewFor(result),
            });
        }
        const image = buildCutDepthPreview(
            stack.map((s) => s.toolpath),
            18,
        );
        let material = 0,
            covered = 0,
            holes = 0,
            untouched = 0;
        let lightest = 0,
            darkest = 255;
        for (let y = 15; y < 120; y += 1)
            for (let x = 8; x < 240; x += 1) {
                let inside = false,
                    distance = Infinity;
                for (const loop of loops)
                    for (let i = 1; i < loop.points.length; i++) {
                        const a = loop.points[i - 1],
                            b = loop.points[i];
                        if (
                            a.y > y !== b.y > y &&
                            x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)
                        )
                            inside = !inside;
                        const dx = b.x - a.x,
                            dy = b.y - a.y;
                        const t = Math.max(
                            0,
                            Math.min(
                                1,
                                ((x - a.x) * dx + (y - a.y) * dy) /
                                    (dx * dx + dy * dy || 1),
                            ),
                        );
                        distance = Math.min(
                            distance,
                            Math.hypot(x - a.x - t * dx, y - a.y - t * dy),
                        );
                    }
                if (distance < 0.5) continue;
                const col = Math.floor((x - image.minX) / image.cellMm),
                    row = Math.floor((image.maxY - y) / image.cellMm);
                const offset = (row * image.width + col) * 4;
                const alpha =
                    col >= 0 &&
                    col < image.width &&
                    row >= 0 &&
                    row < image.height
                        ? image.light[offset + 3]
                        : 0;
                if (inside) {
                    material++;
                    if (alpha) {
                        covered++;
                        lightest = Math.max(lightest, image.light[offset]);
                        darkest = Math.min(darkest, image.light[offset]);
                    }
                } else {
                    holes++;
                    if (!alpha) untouched++;
                }
            }
        expect(material).to.be.greaterThan(300);
        expect(covered / material, 'letter stroke coverage').to.be.greaterThan(
            0.98,
        );
        expect(
            untouched / holes,
            'counters and surrounding stock remain clear',
        ).to.be.greaterThan(0.995);
        expect(
            lightest - darkest,
            'depth gradient across letter strokes',
        ).to.be.greaterThan(15);
        project = {
            loops,
            stack,
            bitmaps: [],
            selected: [],
            hidden: [],
            guides: [],
            fileName: 'V-carved text',
            stock: {
                widthMm: 240,
                heightMm: 125,
                thicknessMm: 18,
                material: 'plywood-mdf',
                origin: 'front-left',
            },
        };
    });
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    JSON.stringify({
                        kind: 'gcam.project',
                        version: 2,
                        fileName: 'V-carved text',
                        snapshot: project,
                    }),
                ),
                fileName: 'vcarve-text.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded vcarve-text.gcam.json.').should('be.visible');
    cy.contains('Job geometry exceeds the configured stock.').should(
        'not.exist',
    );
    cy.get('[aria-label="Cut depths"]', { timeout: 30000 })
        .should('not.contain', 'Calculating')
        .and('not.contain', 'unavailable');
    cy.contains('button', /^Fit$/).click();
    cy.snapshot().then((p) =>
        expect(JSON.stringify(p.stack)).to.equal(JSON.stringify(project.stack)),
    );
    cy.readDownload('.gcam.json').then((raw) =>
        cy.writeFile('../outputs/vcarve-text.gcam.json', raw),
    );
    cy.screenshot('vcarve-text-light', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((raw) => {
        expect(raw).to.match(/G1 X[\d.]+ Y[\d.]+ Z-/);
        cy.writeFile('../outputs/vcarve-text.gcode', raw);
    });
    cy.menu('View', 'Dark / Light Mode');
    cy.get('[aria-label="Cut depths"]').should('be.visible');
    cy.screenshot('vcarve-text-dark', { capture: 'viewport' });
});
