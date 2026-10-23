describe('Shared beginner workflows', () => {
    beforeEach(() => cy.freshProject());
    it('imports an STL once and sends it directly to Rotary', () => {
        cy.importDesign('rotary-asymmetric.stl');
        cy.get('[aria-label="Model units"]').select('mm');
        cy.get('input[name="model-destination"][value="rotary"]').check();
        cy.contains('button', 'Continue to model setup').click();
        cy.get('[aria-label="Rotary workspace"]').should('be.visible');
        cy.get('[aria-label="Rotary shape"]').should(
            'contain.text',
            'rotary-asymmetric',
        );
        cy.get('[aria-label="Rotary toolpath settings"]')
            .contains('button', /^Facing$/)
            .should('not.exist');
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.contains('button', /^Add Toolpath$/, { timeout: 60000 })
            .should('be.enabled')
            .click();
        cy.get('[aria-label="Preview toolpaths"]').should('be.visible').click();
        cy.get('[aria-label="Rotary simulation"]').should('be.visible');
    });
    it('keeps stock editable and generates a shallow pocket from the supplied TicTacToe DXF', () => {
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            'cypress/fixtures/tic-tac-toe.dxf',
            { force: true },
        );
        cy.contains('button', 'Import drawing').click();
        cy.get('[aria-label="Stock Width (mm)"]').clear().type('500').blur();
        cy.get('[aria-label="Stock Height (mm)"]').clear().type('350').blur();
        cy.worldClick(15, 175);
        cy.contains('button', /^Pocket$/).click();
        cy.contains('summary', 'Job stock').click();
        cy.get('[aria-label="Stock Thickness (mm)"]').should('be.visible');
        cy.contains('summary', 'Job stock').click();
        cy.field('Cut depth', 0.5);
        cy.contains('button', /^Add Toolpath/)
            .should('be.enabled')
            .click();
        cy.contains(/Pass depth must/).should('not.exist');
        cy.get('[aria-label="Preview toolpaths"]', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('button', 'Export G-code').should('be.enabled');
        cy.snapshot().then((project) => {
            expect(project.stack).to.have.length(1);
            expect(project.stack[0].args.cutDepth).to.be.lessThan(
                project.stock.thicknessMm,
            );
        });
    });
});
