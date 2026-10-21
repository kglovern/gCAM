describe('Movable canvas windows', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
    });

    it('moves the object browser with its header, clamps it and resets its position', () => {
        cy.menu('View', /Object Browser/);
        const panel = '[aria-label="Object browser"]';
        const handle = '[aria-label="Move object browser"]';
        cy.get(panel).find('[aria-label="Drawing layers"]').should('not.exist');
        cy.get(panel).then(($panel) => {
            const start = $panel[0].getBoundingClientRect();
            cy.get(handle).focus().type('{rightarrow}{downarrow}');
            cy.get(panel).should(($moved) => {
                const moved = $moved[0].getBoundingClientRect();
                expect(moved.left).to.be.closeTo(start.left + 10, 1);
                expect(moved.top).to.be.closeTo(start.top + 10, 1);
            });
            cy.get(handle).type('{home}');
            cy.get(panel).should(($reset) => {
                expect($reset[0].getBoundingClientRect().left).to.be.closeTo(
                    start.left,
                    1,
                );
            });
        });
        for (const pointerType of ['mouse', 'touch']) {
            cy.get(handle).then(($handle) => {
                const element = $handle[0],
                    rect = element.getBoundingClientRect();
                // Synthetic pointers have no native capture; hardware dragging is also verified in the preview.
                if (!element.setPointerCapture.isSinonProxy)
                    cy.stub(element, 'setPointerCapture');
                const pointer = (type, x, y, buttons) =>
                    element.dispatchEvent(
                        new PointerEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            isPrimary: true,
                            pointerId: 1,
                            pointerType,
                            clientX: x,
                            clientY: y,
                            button: 0,
                            buttons,
                        }),
                    );
                pointer('pointerdown', rect.left + 30, rect.top + 15, 1);
                pointer('pointermove', rect.left + 170, rect.top + 35, 1);
                pointer('pointerup', rect.left + 170, rect.top + 35, 0);
                cy.get(panel).should(($moved) =>
                    expect(
                        $moved[0].getBoundingClientRect().left,
                    ).to.be.greaterThan(rect.left + 90),
                );
            });
        }
        cy.viewport(800, 600);
        cy.get(panel).should(($panel) => {
            const rect = $panel[0].getBoundingClientRect();
            expect(rect.right).to.be.at.most(800);
            expect(rect.bottom).to.be.at.most(600);
        });
        cy.get('[aria-label="Close object browser"]').click();
        cy.get(panel).should('not.exist');
    });

    it('moves shape properties without changing the selected geometry', () => {
        cy.worldClick(20, 50);
        cy.get('body').then(($body) => {
            if (!$body.find('[aria-label="Selected shape properties"]').length)
                cy.contains('button', /^Properties$/).click();
        });
        cy.snapshot().then((before) => {
            cy.get('[aria-label="Move selected shape properties"]')
                .focus()
                .type('{leftarrow}{downarrow}');
            cy.snapshot().then((after) =>
                expect(after.loops).to.deep.equal(before.loops),
            );
        });
        cy.get('[aria-label="Selected shape properties"]').should('be.visible');
        cy.get('[aria-label="Close shape properties"]').click();
        cy.get('[aria-label="Selected shape properties"]').should('not.exist');
    });
});
