describe('Mandala drawing', () => {
    it('previews, adds grouped vectors, and undoes the whole mandala', () => {
        cy.freshProject();
        cy.menu('Draw', 'Mandala');
        cy.get('[role="dialog"][aria-label="Mandala"]').should('be.visible');
        cy.get('[aria-label="Mandala preview"] polyline').should(
            'have.length',
            38,
        );
        cy.contains('label', 'Petals per ring').find('input').clear().type('8');
        cy.contains('label', 'Rings').find('input').clear().type('2');
        cy.get('[aria-label="Mandala preview"] polyline').should(
            'have.length',
            18,
        );
        cy.contains('button', 'Add Mandala').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(18);
            expect(p.selected).to.have.length(18);
            expect(new Set(p.loops.map((l) => l.groupId)).size).to.equal(1);
            expect(p.loops[0].groupId).to.be.a('string');
        });
        cy.get('body').type('{ctrl}z');
        cy.snapshot().then((p) => expect(p.loops).to.have.length(0));
        cy.menu('Draw', 'Mandala');
        cy.contains('button', 'Cancel').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(0));
    });
});
