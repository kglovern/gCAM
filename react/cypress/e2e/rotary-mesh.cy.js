describe('Independent XYZA mesh machining', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
        cy.contains('[role="tab"]', 'STL').click();
        cy.get('[aria-label="Import STL file"]').selectFile(
            'cypress/fixtures/rotary-asymmetric.stl',
            { force: true },
        );
        cy.get('[aria-label="Model units"]').select('mm');
        cy.contains('button', 'Continue to model setup').click();
        cy.get('[aria-label="XYZA mesh settings"]')
            .scrollIntoView()
            .should('be.visible');
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
    });
    const configure = () => {
        cy.get('[aria-label="Mesh strategy"]').select('indexed');
        cy.contains('summary', 'Advanced machining settings').click();
        for (const [label, value] of [
            ['Mesh cell', 0.5],
            ['Stepover', 1],
            ['Shank diameter', 4],
            ['Holder diameter', 10],
            ['A spacing', 90],
        ])
            cy.get(`[aria-label="${label}"]`)
                .clear()
                .type(String(value))
                .blur();
    };
    it('adds a roughing toolpath with automatic defaults without opening Advanced', () => {
        cy.contains('summary', 'Advanced machining settings')
            .parent()
            .should('not.have.attr', 'open');
        cy.contains('button', /^Add Toolpath$/, { timeout: 60000 })
            .should('be.enabled')
            .click();
        cy.contains('Job toolpaths (1)').should('be.visible');
        cy.get('[aria-label="Rotary actions"]')
            .contains('button', 'Export G-code', { timeout: 60000 })
            .should('be.enabled');
    });
    it('requires setup, generates Y-aware mesh G-code, and invalidates old output', () => {
        configure();
        cy.contains('button', /^Add Toolpath$/, { timeout: 60000 })
            .should('be.enabled')
            .click();
        cy.task('clearDownloads');
        cy.get('[aria-label="Rotary actions"]')
            .contains('button', 'Export G-code', { timeout: 60000 })
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.contain('G93');
            expect(code).to.match(/G1X[^\r\n]*Y/);
            expect(code).not.to.contain('G0X0.000A0.000');
            expect(code).to.contain('G94');
        });
        cy.get('[aria-label="Stock diameter"]').clear().type('110').blur();
        cy.get('[aria-label="Rotary actions"]')
            .contains('button', 'Export G-code')
            .should('be.disabled');
        cy.contains('Stock must fit', { timeout: 60000 }).should('exist');
    });
    it('preserves helix finishing in saved jobs', () => {
        configure();
        cy.contains('button', /^Finishing$/).click();
        cy.get('[aria-label="Mesh strategy"]').select('helix');
        cy.get('[aria-label="Finish tolerance"]').clear().type('0.75').blur();
        cy.contains('button', /^Add Toolpath$/, { timeout: 60000 })
            .should('be.enabled')
            .click();
        cy.get('[aria-label="Rotary actions"]')
            .contains('button', 'Export G-code', { timeout: 90000 })
            .should('be.enabled');
        cy.get('[aria-label="Fit part"]').click();
        cy.window().then(
            (win) =>
                new Cypress.Promise((resolve) =>
                    win.requestAnimationFrame(() =>
                        win.requestAnimationFrame(resolve),
                    ),
                ),
        );
        cy.screenshot('rotary-helix-fixture', { capture: 'viewport' });
        cy.get('[aria-label="Edit Finishing"]').click();
        cy.get('[aria-label="Mesh strategy"]').should('have.value', 'helix');
        cy.get('[aria-label="Rotary actions"]').should('not.exist');
    });
});
