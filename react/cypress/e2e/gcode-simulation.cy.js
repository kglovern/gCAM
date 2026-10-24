describe('G-code-only Simulation', () => {
    it('previews a full rotary profile without stock-mesh controls', () => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
        cy.get('[aria-label="Import lathe profile file"]').selectFile(
            'cypress/fixtures/rotary-profile-regression.json',
            { force: true },
        );
        cy.get('[aria-label="Stock length"]').clear().type('200').blur();
        cy.contains('button', /^Finishing$/).click();
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test ball').click();
        cy.get('[aria-label="Mesh strategy"]').select('along');
        cy.contains('button', /^Add Toolpath$/, { timeout: 90000 })
            .should('be.enabled')
            .click();
        cy.get('[aria-label="Preview toolpaths"]').click();
        cy.get('[aria-label="Rotary simulation"]').within(() => {
            cy.get('canvas').should('be.visible');
            cy.contains('Drag to orbit', { timeout: 90000 }).should(
                'be.visible',
            );
            cy.get('.rotary-viewport').should('not.exist');
        });
        cy.contains('button', /^Simulate$/).should('not.exist');
        cy.get('[aria-label="Toolpaths"]').click();
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('G-code preview').should('be.visible');
        cy.contains('Stock simulation').should('not.exist');
    });
});
