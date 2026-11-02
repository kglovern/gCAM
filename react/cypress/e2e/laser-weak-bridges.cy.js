const edit = () => {
    cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
        cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
    );
    cy.contains('summary', 'Laser options').then((summary) => {
        if (!summary.parent().prop('open')) cy.wrap(summary).click();
    });
};
const save = () => {
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
};
const lengthAt = (p, power) =>
    p.stack[0].toolpath.laserPaths.reduce(
        (total, path) =>
            total +
            path.points
                .slice(1)
                .reduce(
                    (sum, end, index) =>
                        sum +
                        (end.power === power
                            ? Math.hypot(
                                  end.x - path.points[index].x,
                                  end.y - path.points[index].y,
                              )
                            : 0),
                    0,
                ),
        0,
    );
const setup = () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('vectors.svg');
    cy.worldClick(20, 50);
    cy.contains('button', /^Laser Cut$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
};

it('saves, undoes, reloads and exports reduced-power automatic bridges', () => {
    setup();
    cy.get('[aria-label="Laser passes"]').type('{selectall}2').blur();
    cy.contains('summary', 'Laser options').click();
    cy.contains('label', 'Holding bridges').find('input').check();
    cy.get('[aria-label="Laser bridge width"]').type('{selectall}2').blur();
    cy.get('[aria-label="Laser bridge power percent"]')
        .should('have.value', '0')
        .type('{selectall}20')
        .blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
    let source, raw;
    cy.snapshot().then((p) => {
        source = p.loops;
        expect(p.stack[0].args.laserOptions.bridgePower).to.equal(0.2);
        expect(lengthAt(p, 80)).to.be.closeTo(8, 1e-8);
        expect(
            p.stack[0].preview.some((path) =>
                path.points.some((point) => point.power === 80),
            ),
        ).to.equal(true);
    });
    edit();
    cy.get('[aria-label="Laser bridge power percent"]').scrollIntoView();
    cy.contains('Calculating toolpath').should('not.exist');
    cy.screenshot('laser-weak-bridge-options', { capture: 'viewport' });
    cy.get('[aria-label="Laser bridge power percent"]')
        .type('{selectall}50')
        .blur();
    save();
    cy.snapshot().then((p) => expect(lengthAt(p, 200)).to.be.closeTo(8, 1e-8));
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(lengthAt(p, 80)).to.be.closeTo(8, 1e-8));
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(source);
        expect(lengthAt(p, 200)).to.be.closeTo(8, 1e-8);
    });
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
                fileName: 'weak.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    edit();
    cy.get('[aria-label="Laser bridge power percent"]').should(
        'have.value',
        '50',
    );
    cy.contains('button', /^Cancel Edit$/).click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S200');
        expect(code).to.include('S400');
        expect(code.match(/Laser pass/g)).to.have.length(2);
        expect(code).not.to.match(/M6|G[01] Z/);
    });
});

it('retains weak power when canvas bridges are added, dragged, removed and undone', () => {
    setup();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
    cy.contains('button', /^Add a Bridge$/).click();
    cy.worldClick(30, 40);
    edit();
    cy.get('[aria-label="Bridge generation"]').should('have.value', 'manual');
    cy.get('[aria-label="Laser bridge width"]').type('{selectall}2').blur();
    cy.get('[aria-label="Laser bridge power percent"]')
        .type('{selectall}25')
        .blur();
    save();
    cy.snapshot().then((p) => expect(lengthAt(p, 100)).to.be.closeTo(2, 1e-8));
    cy.contains('button', 'Placing bridges…').should('exist');
    cy.worldDrag([30, 40], [35, 40]);
    cy.snapshot().then((p) => {
        expect(p.stack[0].args.tabs[0].anchor.x).to.be.closeTo(35, 0.01);
        expect(p.stack[0].args.laserOptions.bridgePower).to.equal(0.25);
        expect(lengthAt(p, 100)).to.be.closeTo(2, 1e-8);
    });
    cy.worldClick(35, 40, { button: 2 });
    cy.snapshot().then((p) => {
        expect(p.stack[0].args.tabs).to.have.length(0);
        expect(lengthAt(p, 100)).to.equal(0);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => {
        expect(p.stack[0].args.tabs).to.have.length(1);
        expect(lengthAt(p, 100)).to.be.closeTo(2, 1e-8);
    });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => expect(code).to.include('S100'));
});
