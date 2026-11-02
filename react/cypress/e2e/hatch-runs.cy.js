import { hatchIslands } from '../fixtures/hatch-islands';
const coverage = (paths) =>
    paths
        .flatMap((path) =>
            path.points
                .slice(1)
                .flatMap((end, index) =>
                    end.power > 0
                        ? [
                              JSON.stringify([
                                  path.points[index].x,
                                  path.points[index].y,
                                  end.x,
                                  end.y,
                                  end.power,
                              ]),
                          ]
                        : [],
                ),
        )
        .sort();

it('retains burn coverage through joined overscan, editing, Undo/Redo, reload and actual S0 export', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    const loops = hatchIslands();
    const snapshot = {
        loops,
        selected: loops.map((p) => p.id),
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'Hatch runs',
        stock: {
            widthMm: 100,
            heightMm: 80,
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
            fileName: 'hatch.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.get('[aria-label="Laser"]').click();
    cy.contains('button', /^Laser Fill$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.get('[aria-label="Laser line interval"]').type('{selectall}1').blur();
    cy.contains('summary', 'Laser options').click();
    cy.get('[aria-label="Hatch overscan"]').type('{selectall}2').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Fill"]').should('exist');
    let joined, burn, raw;
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(loops);
        joined = p.stack[0].toolpath.laserPaths;
        burn = coverage(joined);
        expect(joined.length).to.equal(8);
        expect(burn.length).to.equal(80);
        expect(
            joined[0].points.filter((point) => point.power === 0).length,
        ).to.be.greaterThan(3);
    });
    const edit = () => {
        cy.get('input[aria-label^="Name Laser Fill"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
    };
    edit();
    cy.get('[aria-label="Hatch overscan"]').scrollIntoView();
    cy.contains('Calculating toolpath').should('not.exist');
    cy.screenshot('joined-hatch-overscan', { capture: 'viewport' });
    cy.get('[aria-label="Hatch overscan"]').type('{selectall}0').blur();
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
    cy.snapshot().then((p) => {
        expect(p.stack[0].toolpath.laserPaths.length).to.equal(80);
        expect(coverage(p.stack[0].toolpath.laserPaths)).to.deep.equal(burn);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(joined),
    );
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths.length).to.equal(80),
    );
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(joined),
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
                fileName: 'saved-hatch.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserPaths).to.deep.equal(joined),
    );
    edit();
    cy.get('[aria-label="Hatch overscan"]').should('have.value', '2');
    cy.contains('button', /^Cancel Edit$/).click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect((code.match(/^G0 X/gm) || []).length).to.equal(8);
        expect(code).to.match(/^G1 X14 S0$/m);
        expect(code).to.include('S400');
        expect(code).not.to.match(/NaN|Infinity|M6|G[01] Z/);
    });
});
