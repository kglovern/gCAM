describe('Fresh tool library', () => {
    it('configures flat, ball and V-bit cutters through the empty-library flow', () => {
        cy.freshProject({ tools: false });
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Outside$/).click();
        cy.contains('No tools set up yet').should('be.visible');
        cy.contains('button', 'Set up your tools').click();
        for (const [index, type] of ['flat', 'ball', 'v-bit'].entries()) {
            if (index > 0)
                cy.get(`[aria-label="Edit tool T${index + 1}"]`).click();
            cy.contains('[role=tab]', 'Custom').click();
            cy.contains('label', 'Tool Name')
                .find('input')
                .clear()
                .type(`Test ${type}`);
            cy.contains('label', /^Type/).find('select').select(type);
            cy.field('Diameter (mm)', type === 'v-bit' ? 6 : 2);
            cy.field('Flutes', 2);
            if (type === 'v-bit') cy.field('V Angle', 60);
            cy.contains('button', 'Save Tool').should('be.enabled').click();
        }
        cy.get('[aria-label="Close tool library"]').click();
        cy.get('[aria-label="Tool library slot"]').should(
            'contain.text',
            'Test flat',
        );
        cy.window().then((win) => {
            const slots = JSON.parse(
                win.localStorage.getItem('gcam.myEndmills.v1'),
            ).slots;
            expect(
                slots.slice(0, 3).map((tool) => tool.toolType),
            ).to.deep.equal(['flat', 'ball', 'v-bit']);
        });
        cy.reload();
        cy.contains('Recovered the last local project.').should('be.visible');
        cy.get('[data-testid="gcam-canvas"]').should(($el) =>
            expect(JSON.parse($el.attr('data-camera')).scale).to.be.greaterThan(
                1,
            ),
        );
        cy.worldClick(20, 50);
        cy.contains('button', /^Outside$/).click();
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').should('be.visible');
        cy.contains('[role="option"]', 'Test ball').should('be.visible');
        cy.contains('[role="option"]', 'Test v-bit').should('be.visible');
    });
});
