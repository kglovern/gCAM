describe('Canvas toolbar labels', () => {
    it('shows labels on a tablet-width toolbar and keeps phone tools accessible', () => {
        cy.viewport(954, 884);
        cy.freshProject({ tools: false });
        for (const name of [
            'File',
            'Edit',
            'View',
            'Draw',
            'Select shapes',
            'Transform selection',
        ]) {
            cy.get(
                `[role="toolbar"] button[aria-label="${name}"] > span`,
            ).should('be.visible');
        }
        cy.get('[role="toolbar"]').then(($bar) => {
            const buttons = [
                ...$bar[0].querySelectorAll(
                    ':scope > button, :scope > div > button',
                ),
            ];
            const tops = buttons.map(
                (button) => button.getBoundingClientRect().top,
            );
            expect(Math.max(...tops) - Math.min(...tops)).to.be.lessThan(2);
        });
        cy.screenshot('toolbar-tablet-labels', { capture: 'viewport' });
        cy.viewport(390, 844);
        cy.get('[aria-label="More tools"]').should('be.visible').click();
        cy.get('[role="group"][aria-label="More canvas tools"]')
            .contains('button', 'Edit')
            .should('be.visible');
    });
});
