const shape = (id, points, extra = {}) => ({ id, points, ...extra });
const rectangle = (id, x, y, w, h, extra = {}) =>
    shape(
        id,
        [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
            { x, y },
        ],
        extra,
    );
const source = () => [
    rectangle('outer', 20, 20, 20, 30, { groupId: 'letter', layerId: 'cut' }),
    rectangle('hole', 25, 25, 8, 12, { groupId: 'letter', layerId: 'cut' }),
];
const load = (loops = source()) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'Drawing patterns',
                    snapshot: {
                        loops,
                        selected: loops.length ? [loops[0].id] : [],
                        hidden: [],
                        stack: [],
                        bitmaps: [],
                        guides: [],
                        fileName: 'Drawing patterns',
                        stock: {
                            width: 200,
                            height: 200,
                            thickness: 3,
                            material: 'plywood-mdf',
                            origin: 'front-left',
                        },
                    },
                }),
            ),
            fileName: 'patterns.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
const open = (menu = 'Mirror…') => {
    cy.menu('Edit', menu);
    cy.contains('button', /^Apply (mirror|pattern)$/).should('be.enabled');
};
const length = (label, value) =>
    cy.get(`[aria-label="${label}"]`).type(`{selectall}${value}`).blur();
const zoomOut = (count) => {
    for (let i = 0; i < count; i++) cy.menu('View', 'Zoom Out');
};

it('mirrors grouped artwork with exact history, project persistence and regenerated Laser export', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    load();
    let original, mirrored, saved;
    cy.snapshot().then((p) => {
        original = p.loops;
    });
    open();
    length('Mirror line X', 50);
    cy.contains('button', /^Apply mirror$/).should('be.enabled');
    zoomOut(4);
    cy.screenshot('mirror-preview', { capture: 'viewport' });
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(original));
    open();
    length('Mirror line X', 50);
    cy.contains('button', /^Apply mirror$/)
        .should('be.enabled')
        .click();
    cy.snapshot().then((p) => {
        mirrored = p.loops;
        expect(p.loops[0].points[0]).to.deep.equal({ x: 80, y: 20 });
        expect(p.loops[1].points[0]).to.deep.equal({ x: 75, y: 25 });
        expect(p.loops.map((s) => s.id)).to.deep.equal(
            original.map((s) => s.id),
        );
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(original));
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(mirrored));
    cy.readDownload('.gcam.json').then((text) => {
        saved = text;
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(saved),
                fileName: 'saved-pattern.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(mirrored));
    cy.contains('button', /^Laser Fill$/).click();
    cy.contains('button', /^Change$/).click();
    length('Laser power percent', 30);
    length('Laser line interval', 1);
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Fill"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        let powered = 0;
        for (const row of p.stack[0].toolpath.laserPaths)
            for (let i = 1; i < row.points.length; i++) {
                const a = row.points[i - 1],
                    b = row.points[i];
                if (!(b.power > 0)) continue;
                powered++;
                const x = (a.x + b.x) / 2,
                    y = (a.y + b.y) / 2;
                expect(
                    x > 67.001 && x < 74.999 && y > 25.001 && y < 36.999,
                ).to.equal(false);
            }
        expect(powered).to.be.greaterThan(0);
    });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S300');
        expect(code).not.to.match(/NaN|Infinity|M6|G[01] Z/);
    });
});

it('creates rectangular copies with distinct groups and circular copies with editable centre and partial sweep', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    load();
    open('Rectangular pattern…');
    cy.get('[aria-label="Columns"]').clear().type('3');
    length('Horizontal gap', 10);
    length('Vertical gap', 15);
    cy.contains('button', /^Apply pattern$/).should('be.enabled');
    zoomOut(7);
    cy.screenshot('rectangular-pattern-preview', { capture: 'viewport' });
    cy.contains('button', /^Apply pattern$/).click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.have.length(12);
        expect(p.loops[2].points[0]).to.deep.equal({ x: 50, y: 20 });
        expect(p.loops[6].points[0]).to.deep.equal({ x: 20, y: 65 });
        expect(p.loops[2].groupId).to.equal(p.loops[3].groupId);
        expect(p.loops[2].groupId).not.to.equal(p.loops[4].groupId);
        expect(new Set(p.loops.map((s) => s.id)).size).to.equal(12);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.have.length(2));
    load([
        shape('triangle', [
            { x: 40, y: 20 },
            { x: 50, y: 20 },
            { x: 40, y: 30 },
            { x: 40, y: 20 },
        ]),
    ]);
    open('Circular pattern…');
    length('Centre X', 50);
    length('Centre Y', 50);
    cy.get('[aria-label="Total positions"]').clear().type('4');
    cy.contains('button', /^Apply pattern$/).should('be.enabled');
    zoomOut(11);
    cy.screenshot('circular-pattern-preview', { capture: 'viewport' });
    cy.contains('button', /^Apply pattern$/).click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.have.length(4);
        expect(p.loops[1].points[0].x).to.be.closeTo(80, 1e-8);
        expect(p.loops[1].points[0].y).to.be.closeTo(40, 1e-8);
    });
    cy.get('[aria-label="Undo"]').click();
    open('Circular pattern…');
    length('Centre X', 50);
    length('Centre Y', 50);
    cy.get('[aria-label="Total positions"]').clear().type('3');
    cy.get('[aria-label="Sweep angle (°)"]').clear().type('-180');
    cy.contains('Rotate copies').find('input').uncheck();
    cy.contains('button', /^Apply pattern$/)
        .should('be.enabled')
        .click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.have.length(3);
        expect(p.loops[2].points[1].x - p.loops[2].points[0].x).to.be.closeTo(
            10,
            1e-8,
        );
    });
});

it('rejects stale edits and invalid copy settings, and disables tools without drawing selections', () => {
    cy.freshProject({ tools: false });
    load();
    open('Rectangular pattern…');
    cy.get('[aria-label="Columns"]').clear().type('1000');
    cy.get('[aria-label="Rows"]').clear().type('1000');
    cy.contains('Too many copies', { timeout: 30000 }).should('be.visible');
    cy.contains('button', /^Apply pattern$/).should('be.disabled');
    cy.contains('button', /^Cancel$/).click();
    open();
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.contains('button', /^Apply mirror$/).click();
    cy.contains('Source shapes changed').should('be.visible');
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.have.length(2);
        expect(p.loops[0].points[0].x).not.to.equal(20);
    });
    load([]);
    cy.get('button[aria-label="Edit"]').click();
    for (const name of ['Mirror…', 'Rectangular pattern…', 'Circular pattern…'])
        cy.contains('[role="menuitem"]', name).should('be.disabled');
});
