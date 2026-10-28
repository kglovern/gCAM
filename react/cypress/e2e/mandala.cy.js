describe('Mandala drawing', () => {
    it('previews, adds grouped vectors, and undoes the whole mandala', () => {
        cy.freshProject();
        cy.menu('Draw', 'Mandala');
        cy.get('[role="dialog"][aria-label="Mandala"]').should('not.exist');
        cy.get('[data-testid="gcam-canvas"]').should(
            'have.class',
            'cursor-crosshair',
        );
        cy.worldClick(30, 30);
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
            const points = p.loops.flatMap((loop) => loop.points);
            for (const axis of ['x', 'y']) {
                const values = points.map((point) => point[axis]);
                expect(
                    (Math.min(...values) + Math.max(...values)) / 2,
                ).to.be.closeTo(30, 0.01);
            }
        });
        cy.get('body').type('{ctrl}z');
        cy.snapshot().then((p) => expect(p.loops).to.have.length(0));
        cy.menu('Draw', 'Mandala');
        cy.worldClick(60, 30);
        cy.contains('button', 'Cancel').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(0));
    });
});
