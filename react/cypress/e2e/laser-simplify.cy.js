const circle = (id, radius, count) => ({
    id,
    layerId: 'default',
    groupId: 'ring',
    points: Array.from({ length: count + 1 }, (_, i) => ({
        x: 120 + radius * Math.cos((i === count ? 0 : i / count) * 2 * Math.PI),
        y: 120 + radius * Math.sin((i === count ? 0 : i / count) * 2 * Math.PI),
    })),
});
const load = (snapshot) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    fileName: 'Simplify drawing',
                    snapshot,
                }),
            ),
            fileName: 'simplify.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
const open = () => {
    cy.menu('Edit', 'Simplify paths…');
    cy.contains(/2 shapes simplified/, { timeout: 30000 }).should('be.visible');
};
it('stages bounded line fitting, preserves holes/groups and unrelated jobs through cancel/history/export/reload', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false, multipleSelection: false });
    cy.get('[aria-label="Laser"]').click();
    let original, fitted;
    cy.window().then(async (win) => {
        const loops = [
            circle('outer', 50, 1000),
            circle('hole', 20, 500),
            {
                id: 'other',
                points: [
                    { x: 200, y: 100 },
                    { x: 220, y: 130 },
                ],
            },
        ];
        const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        );
        const stack = [];
        for (const [id, sources] of [
            ['ring-job', loops.slice(0, 2)],
            ['other-job', loops.slice(2)],
        ]) {
            const args = {
                loops: sources,
                operation: 'laser-cut',
                toolDiameter: 0.1,
                cutDepth: 1,
                laserFeed: 1000,
                laserPower: 300,
                laserSpot: 0.1,
            };
            const result = await buildToolpathGcodeAsync(args);
            stack.push({
                id,
                label: id,
                args,
                toolpath: result.toolpath,
                preview: result.previewContours.map((points) => ({ points })),
                customLabel: id,
            });
        }
        original = {
            loops,
            stack,
            selected: ['outer', 'hole'],
            hidden: [],
            bitmaps: [],
            guides: [],
            fileName: 'Simplify drawing',
            stock: {
                widthMm: 300,
                heightMm: 300,
                thicknessMm: 3,
                material: 'sheet-goods',
                laserMaterial: 'plywood',
                origin: 'front-left',
            },
        };
        load(original);
    });
    open();
    cy.contains('1502 →').should('be.visible');
    cy.contains('1 related toolpaths will be removed').should('be.visible');
    cy.screenshot('laser-simplify-paths', { capture: 'viewport' });
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(original.loops);
        expect(p.stack).to.have.length(2);
    });
    open();
    cy.contains('button', /^Apply simplification$/).click();
    cy.snapshot().then((p) => {
        fitted = p;
        expect(p.stack.map((j) => j.id)).to.deep.equal(['other-job']);
        expect(p.loops[2]).to.deep.equal(original.loops[2]);
        for (let i = 0; i < 2; i++) {
            expect(p.loops[i].id).to.equal(original.loops[i].id);
            expect(p.loops[i].groupId).to.equal('ring');
            expect(p.loops[i].points.length).to.be.lessThan(
                original.loops[i].points.length / 4,
            );
            expect(p.loops[i].points[0]).to.deep.equal(
                p.loops[i].points.at(-1),
            );
        }
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(original.loops);
        expect(p.stack).to.have.length(2);
    });
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(fitted.loops));
    cy.contains('button', /^Laser Fill$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Fill"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        const job = p.stack.find((j) => j.args.operation === 'laser-fill');
        expect(job.args.loops).to.have.length(2);
        let minimumRadius = Infinity;
        for (const row of job.toolpath.laserPaths)
            for (let i = 1; i < row.points.length; i++) {
                const a = row.points[i - 1],
                    b = row.points[i];
                if (b.power <= 0) continue;
                for (const t of [0, 0.25, 0.5, 0.75, 1])
                    minimumRadius = Math.min(
                        minimumRadius,
                        Math.hypot(
                            a.x + t * (b.x - a.x) - 120,
                            a.y + t * (b.y - a.y) - 120,
                        ),
                    );
            }
        expect(minimumRadius).to.be.greaterThan(19.9);
        load(p);
    });
    cy.contains('button:not([role=menuitem])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S250');
        expect(code).to.match(/G[01]/);
    });
});

it('rejects fitting captured before source edits and recalculates tolerance without committing', () => {
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    const source = circle('curve', 40, 1000);
    load({
        loops: [source],
        selected: ['curve'],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'Stale curve',
    });
    cy.menu('Edit', 'Simplify paths…');
    cy.contains('1 shapes simplified', { timeout: 30000 }).should('be.visible');
    cy.get('[aria-label="Path repair tolerance"]')
        .type('{selectall}0.1')
        .blur();
    cy.contains('1 shapes simplified', { timeout: 30000 }).should('be.visible');
    cy.snapshot().then((p) => expect(p.loops[0]).to.deep.equal(source));
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.contains('button', /^Apply simplification$/).click();
    cy.contains('[role="alert"]', 'Source shapes changed').should('be.visible');
    cy.snapshot().then((p) => {
        expect(p.loops[0].points).to.have.length(1001);
        expect(p.loops[0].points[0].x).to.equal(161);
    });
});
