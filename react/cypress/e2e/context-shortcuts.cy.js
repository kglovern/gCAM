const rightClick = (x, y) =>
    cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
        const camera = JSON.parse($canvas.attr('data-camera')),
            rect = $canvas[0].getBoundingClientRect();
        const point = {
            clientX: rect.left + camera.tx + x * camera.scale,
            clientY: rect.top + camera.ty - y * camera.scale,
            button: 2,
        };
        cy.wrap($canvas)
            .parent()
            .trigger('pointerdown', {
                ...point,
                eventConstructor: 'PointerEvent',
                pointerType: 'mouse',
            });
        cy.wrap($canvas).trigger('contextmenu', point);
    });
describe('Context selection shortcuts', () => {
    it('offers shape tools and groups the current selection', () => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
        rightClick(20, 50);
        cy.get('[aria-label="Item actions"]').within(() => {
            cy.contains('[role="menuitem"]', 'Mirror…').should('be.enabled');
            cy.contains('[role="menuitem"]', 'Fillet…').should('be.enabled');
            cy.contains('[role="menuitem"]', 'Trace into shapes…').should(
                'not.exist',
            );
        });
        cy.get('[aria-label="Item actions"]')
            .contains('button', 'Mirror…')
            .click();
        cy.contains('button', /^Apply mirror$/).should('be.enabled');
        cy.contains('button', /^Cancel$/).click();
        cy.get('[aria-label="Select layer Default"]').click();

        rightClick(20, 50);
        cy.get('[aria-label="Item actions"]')
            .contains('button', /^Group$/)
            .click();
        cy.snapshot().then((project) =>
            expect(project.loops.filter((loop) => loop.groupId)).to.have.length(
                3,
            ),
        );
        rightClick(20, 50);
        cy.get('[aria-label="Item actions"]')
            .contains('button', /^Ungroup$/)
            .click();
        cy.snapshot().then((project) =>
            expect(project.loops.filter((loop) => loop.groupId)).to.have.length(
                0,
            ),
        );
    });
});
