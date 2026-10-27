describe('Mobile editing workflow', () => {
    beforeEach(() => {
        cy.viewport(390, 844);
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.then(() =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Emulation.setTouchEmulationEnabled',
                params: { enabled: true, maxTouchPoints: 5 },
            }),
        );
    });
    afterEach(() =>
        cy.then(() =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Emulation.setTouchEmulationEnabled',
                params: { enabled: false },
            }),
        ),
    );

    it('fits the toolbar and permanent canvas/settings split at supported tablet sizes', () => {
        for (const width of [768, 800, 1024]) {
            cy.viewport(width, 844);
            cy.get('header')
                .first()
                .should(($header) =>
                    expect(
                        $header[0].getBoundingClientRect().height,
                    ).to.be.at.most(64),
                );
            cy.get('[data-testid="gcam-canvas"]').should(($canvas) => {
                const rect = $canvas[0].getBoundingClientRect();
                expect(rect.bottom).to.be.at.most(844);
                expect(rect.height).to.be.greaterThan(250);
                expect(rect.width).to.be.greaterThan(
                    width - (width > 844 ? 450 : 130),
                );
            });
        }
    });

    it('exposes secondary tools by name and closes overflow on a choice', () => {
        cy.get('[aria-label="More tools"]').click();
        cy.get('[aria-label="More canvas tools"]').should('be.visible');
        cy.get('button[aria-label="View"]').click();
        cy.contains('[role="menuitem"]', 'Object Browser').click();
        cy.get('[aria-label="More canvas tools"]').should('not.exist');
        cy.get('[aria-label="Object browser"]').should('be.visible');
        cy.get('[aria-label="Multiple selection in object browser"]').click();
        cy.contains('button', 'Vector 1 (').click();
        cy.contains('button', 'Vector 2 (').click();
        cy.get('[aria-label="Close object browser"]').click();
        cy.snapshot().then((project) =>
            expect(project.selected).to.have.length(2),
        );
    });

    it('adds and removes canvas selections without a keyboard, then pans without changing selection', () => {
        cy.worldClick(20, 50);
        cy.get('[aria-label="Multiple selection"]').click();
        cy.worldClick(50, 50);
        cy.snapshot().then((project) =>
            expect(project.selected).to.have.length(2),
        );
        cy.worldClick(20, 50);
        cy.snapshot().then((project) =>
            expect(project.selected).to.have.length(1),
        );
        cy.get('[aria-label="Pan view"]').click();
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const before = JSON.parse($canvas.attr('data-camera'));
            cy.worldDrag([50, 50], [60, 55]);
            cy.get('[data-testid="gcam-canvas"]').should(($after) =>
                expect(
                    JSON.parse($after.attr('data-camera')).tx,
                ).to.be.greaterThan(before.tx),
            );
        });
        cy.snapshot().then((project) =>
            expect(project.selected).to.have.length(1),
        );
        cy.get('[aria-label="Clear selection"]').click();
        cy.snapshot().then((project) =>
            expect(project.selected).to.have.length(0),
        );
    });

    it('keeps tool editor actions visible at keyboard height and returns to the settings panel', () => {
        cy.worldClick(20, 50);
        cy.get('[aria-label="Open tool library"]').click();
        cy.get('[aria-label="Edit tool T1"]').click();
        cy.viewport(1024, 360);
        cy.contains('button', 'Save Tool').should(($button) => {
            const rect = $button[0].getBoundingClientRect();
            expect(rect.bottom).to.be.at.most(360);
            expect(rect.top).to.be.greaterThan(0);
        });
        cy.contains('button', /^Cancel$/).click();
        cy.get('[aria-label="Close tool library"]')
            .focus()
            .trigger('keydown', { key: 'Escape' });
        cy.get('[role="dialog"]').should('not.exist');
        cy.get('[aria-label="Toolpath settings panel"]').should('be.visible');
        cy.get('[aria-label="Open tool library"]').should('have.focus');
    });

    it('opens single-shape properties from the object browser without overlapping panels', () => {
        cy.viewport(800, 1280);
        cy.menu('View', 'Object Browser');
        cy.contains('button', 'Vector 1 (').click();
        cy.get('[aria-label="Object browser"]')
            .contains('button', /^Edit$/)
            .click();
        cy.get('[aria-label="Object browser"]').should('not.exist');
        cy.get('[aria-label="Selected shape properties"]').should('be.visible');
    });
    it('keeps configuration readable and gives every switch a name', () => {
        cy.get('[aria-label="Config"]').click();
        cy.get('[role="switch"]').each(
            ($switch) => expect($switch.attr('aria-label')).not.to.be.empty,
        );
        cy.get('main input, main select, [role="radiogroup"]').each(
            ($control) => {
                const rect = $control[0].getBoundingClientRect();
                expect(rect.left).to.be.at.least(0);
                expect(rect.right).to.be.at.most(390);
            },
        );
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('summary', 'G-code')
            .should('be.visible')
            .parent()
            .should('not.have.attr', 'open');
        cy.get('[aria-label="G-code preview"] canvas').should(($canvas) =>
            expect($canvas[0].getBoundingClientRect().height).to.be.greaterThan(
                400,
            ),
        );
    });
});
