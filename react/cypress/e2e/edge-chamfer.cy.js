const rect = (id, x, y, w, h) => ({
    id,
    groupId: 'part',
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const source = () => [
    rect('outer', 20, 20, 80, 60),
    rect('hole', 40, 40, 20, 20),
];
const load = (p) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'Edge chamfer',
                    snapshot: p,
                }),
            ),
            fileName: 'chamfer.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
const base = () => ({
    loops: source(),
    selected: ['outer'],
    hidden: [],
    stack: [],
    bitmaps: [],
    guides: [],
    stock: {
        widthMm: 150,
        heightMm: 100,
        thicknessMm: 18,
        material: 'plywood-mdf',
        origin: 'front-left',
    },
    fileName: 'Edge chamfer',
});
const length = (label, value) =>
    cy.get(`[aria-label="${label}"]`).type(`{selectall}${value}`).blur();
const edit = () => cy.get('[aria-label^="Edit Chamfer"]').click();
const save = () => {
    cy.contains('button', /^Save Toolpath$/)
        .should('be.enabled')
        .click();
    cy.get('[aria-label^="Edit Chamfer"]', { timeout: 30000 }).should('exist');
};
const exportCode = () => {
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    return cy.readDownload('.gcode');
};

it('generates edge-width chamfers, preserves width when tip offset changes, and retains history/persistence/export', () => {
    cy.viewport(1280, 800);
    cy.freshProject();
    load(base());
    cy.contains('button', /^Chamfer$/).click();
    cy.get('button[aria-label="Tool library slot"]').click();
    cy.contains('[role="option"]', 'Test v-bit').click();
    cy.get('[aria-label="Chamfer width"]').should('have.value', '0.5');
    length('Chamfer width', 1);
    length('Chamfer tip offset', 0.5);
    cy.contains('Tip depth: 2.23mm').should('be.visible');
    cy.screenshot('edge-chamfer-form', { capture: 'viewport' });
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('[aria-label^="Edit Chamfer"]', { timeout: 30000 }).should('exist');
    let original, changed, raw;
    cy.snapshot().then((p) => {
        original = p;
        const job = p.stack[0];
        expect(job.args.chamferWidthMm).to.equal(1);
        expect(job.args.chamferTipOffsetMm).to.equal(0.5);
        expect(job.toolpath.cutDepth).to.be.closeTo(2.232050807568877, 1e-7);
        expect(
            Math.min(...job.preview[0].points.map((v) => v.x)),
        ).to.be.closeTo(19.7113, 0.001);
    });
    edit();
    length('Chamfer tip offset', 1);
    save();
    cy.snapshot().then((p) => {
        changed = p;
        expect(p.stack[0].args.chamferWidthMm).to.equal(1);
        expect(p.stack[0].toolpath.cutDepth).to.be.closeTo(
            2.732050807568877,
            1e-7,
        );
        expect(p.loops).to.deep.equal(original.loops);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.stack).to.deep.equal(original.stack));
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => expect(p.stack).to.deep.equal(changed.stack));
    cy.readDownload('.gcam.json').then((text) => {
        raw = text;
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'saved-chamfer.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded saved-chamfer.gcam.json.').should('be.visible');
    edit();
    cy.get('[aria-label="Chamfer width"]').should('have.value', '1');
    cy.get('[aria-label="Chamfer tip offset"]').should('have.value', '1');
    cy.contains('button', /^Cancel Edit$/).click();
    exportCode().then((code) => {
        expect(code).to.match(/G1 Z-2\.7321/);
        expect(code).not.to.match(/NaN|Infinity/);
    });
    edit();
    length('Chamfer width', 99);
    cy.contains('Preview unavailable', { timeout: 30000 }).should('be.visible');
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('Chamfer exceeds the V-bit diameter').should('be.visible');
    cy.contains('button', /^Cancel Edit$/).click();
    cy.snapshot().then((p) => expect(p.stack).to.deep.equal(changed.stack));
});

it('keeps legacy centreline chamfer output until explicitly converted', () => {
    cy.freshProject();
    let old;
    cy.window()
        .then(async (win) => {
            const { buildToolpathGcodeAsync } = await win.eval(
                    "import('/src/lib/engine.ts')",
                ),
                { previewFor } = await win.eval(
                    "import('/src/toolpaths/useToolpathStack.ts')",
                );
            const p = base(),
                args = {
                    operation: 'chamfer',
                    loops: p.loops,
                    toolDiameter: 15,
                    cutterAngle: 60,
                    cutDepth: 1,
                    passDepth: 0.5,
                    toolNumber: 3,
                    libraryToolId: 'sienci-15mm_60-degree-v-bit',
                    libraryToolName: 'Test v-bit',
                    feedRate: 1000,
                    plungeRate: 300,
                    spindle: 18000,
                };
            const r = await buildToolpathGcodeAsync(args);
            p.selected = [];
            p.stack = [
                {
                    id: 'legacy',
                    label: r.label,
                    args,
                    preview: previewFor(r),
                    toolpath: r.toolpath,
                },
            ];
            return p;
        })
        .then(load);
    exportCode().then((code) => {
        old = code;
    });
    edit();
    cy.contains('Legacy centreline chamfer').should('be.visible');
    cy.get('[aria-label="Chamfer width"]').should('not.exist');
    save();
    exportCode().then((code) => expect(code).to.equal(old));
    edit();
    cy.contains('button', 'Use edge width').click();
    cy.get('[aria-label="Chamfer width"]').should('have.value', '0.5');
    save();
    cy.snapshot().then((p) => {
        expect(p.stack[0].args.chamferWidthMm).to.equal(0.5);
        expect(p.stack[0].toolpath.cutDepth).to.be.lessThan(1.2);
    });
    exportCode().then((code) => expect(code).not.to.equal(old));
});
