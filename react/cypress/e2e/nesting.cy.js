describe('Nesting rotations and grouped contours', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.get('input[aria-label="Import project file"]').selectFile(
            'cypress/fixtures/nesting.gcam.json',
            { force: true },
        );
        cy.contains('Loaded nesting.gcam.json.').should('be.visible');
    });
    const configure = (rotation) => {
        cy.menu('Edit', 'Nest…');
        cy.get('[aria-label="W in mm"]').clear().type('20').blur();
        cy.get('[aria-label="H in mm"]').clear().type('45').blur();
        cy.get('[aria-label="Edge margin in mm"]').clear().type('0').blur();
        cy.get('[aria-label="Part gap in mm"]').clear().type('0').blur();
        cy.get('[aria-label="Nesting rotation"]').select(rotation);
        cy.contains('button', /^Nest$/).click();
    };
    it('leaves the drawing intact when rotation is off and the group cannot fit', () => {
        configure('0');
        cy.contains('button', 'Stop and keep best').should('be.disabled');
        cy.contains(
            'aside[aria-label="Optimising nesting"] button',
            /^Cancel$/,
        ).click();
        cy.snapshot().then((p) => {
            expect(p.loops.map((l) => l.id)).to.deep.equal(['outer', 'inner']);
            expect(p.loops[0].points[1].x).to.equal(40);
        });
    });
    it('cancels a running search without editing geometry', () => {
        configure('90');
        cy.contains(
            'aside[aria-label="Optimising nesting"] button',
            /^Cancel$/,
        ).click();
        cy.snapshot().then((p) =>
            expect(p.loops.map((l) => l.id)).to.deep.equal(['outer', 'inner']),
        );
    });
    it('stops early and keeps the best complete grouped layout', () => {
        configure('90');
        cy.contains('button', 'Stop and keep best')
            .should('be.enabled')
            .click();
        cy.contains('Nested 1 part on').should('be.visible');
        cy.snapshot().then((p) =>
            expect(p.loops.every((l) => l.groupId === 'letter-d')).to.equal(
                true,
            ),
        );
    });
    it('rotates the complete group, reserves its interior and supports undo', () => {
        configure('90');
        cy.contains('button', 'Stop and keep best')
            .should('be.enabled')
            .click();
        cy.contains('Nested 1 part on').should('be.visible');
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(2);
            expect(p.loops.every((l) => l.groupId === 'letter-d')).to.equal(
                true,
            );
            const [outer, inner] = p.loops;
            const width =
                Math.max(...outer.points.map((p) => p.x)) -
                Math.min(...outer.points.map((p) => p.x));
            expect(width).to.be.closeTo(15, 0.001);
            const a = outer.points[0],
                b = inner.points[0];
            expect(Math.hypot(a.x - b.x, a.y - b.y)).to.be.closeTo(
                Math.hypot(10, 4),
                0.001,
            );
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => expect(p.loops[0].points[1].x).to.equal(40));
    });
});
