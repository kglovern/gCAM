import { travelFixture } from '../fixtures/laser-travel';

it('uses the improved route through Generate, Save, Undo/Redo, project reload and export', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    let source, before, oldGreedy, raw;
    const loops = travelFixture(20);
    const snapshot = {
        loops,
        selected: loops.map((p) => p.id),
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'Travel demo',
        stock: {
            widthMm: 180,
            heightMm: 150,
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
            fileName: 'travel.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.get('[aria-label="Laser"]').click();
    cy.contains('button', /^Laser Cut$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.contains('summary', 'Laser options').click();
    cy.contains('label', 'Reduce travel').find('input').uncheck();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
    cy.snapshot().then((p) => {
        source = p.loops;
        before = p.stack[0].toolpath.laserPaths;
        return cy.window().then(async (win) => {
            const { orderLaserCuts } = await win.eval(
                "import('/scripts/fixtures/laser-order-reference.mjs')",
            );
            const { laserTravel } = await win.eval(
                "import('/src/cam/laser-order.js')",
            );
            oldGreedy = laserTravel(
                orderLaserCuts(before, {
                    innerFirst: true,
                    optimizeTravel: true,
                }),
            );
        });
    });
    const edit = () => {
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
    };
    edit();
    cy.contains('label', 'Reduce travel').find('input').check();
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
    let improved;
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(source);
        improved = p.stack[0].toolpath.laserPaths;
        return cy.window().then(async (win) => {
            const { laserTravel } = await win.eval(
                "import('/src/cam/laser-order.js')",
            );
            expect(laserTravel(improved)).to.be.lessThan(oldGreedy * 0.99);
        });
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(before),
    );
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(improved),
    );
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
                fileName: 'saved-travel.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(improved),
    );
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S400');
        expect(code).not.to.match(/M6|G[01] Z|NaN|Infinity/);
    });
    cy.get('input[aria-label^="Name Laser Cut"]')
        .closest('.animate-in')
        .should('have.css', 'opacity', '1');
    cy.screenshot('laser-travel-layout', { capture: 'viewport' });
});
