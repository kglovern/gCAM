describe('Transform before selection', () => {
    it('can be armed first and stays armed when selecting and clearing items', () => {
        cy.freshProject();
        cy.get('[aria-label="Transform selection"]')
            .should('be.enabled')
            .click();
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'true',
        );
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'true',
        );
        cy.worldClick(20, 50);
        cy.worldDrag([30, 50], [35, 55]);
        cy.snapshot().then((p) => {
            const item = p.loops.find((l) => p.selected.includes(l.id));
            expect(Math.min(...item.points.map((p) => p.x))).to.be.closeTo(
                25,
                0.1,
            );
        });
        cy.worldClick(45, 35);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(0));
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'true',
        );
        cy.worldClick(50, 50);
        cy.worldDrag([60, 50], [65, 55]);
        cy.snapshot().then((p) => {
            const item = p.loops.find((l) => p.selected.includes(l.id));
            expect(Math.min(...item.points.map((p) => p.x))).to.be.closeTo(
                55,
                0.1,
            );
        });
        cy.get('body').type('{esc}');
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'false',
        );
    });
});
