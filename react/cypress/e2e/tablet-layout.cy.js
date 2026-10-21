describe('Tablet workspace', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
    });
    afterEach(() =>
        cy.then(() =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Emulation.setTouchEmulationEnabled',
                params: { enabled: false },
            }),
        ),
    );
    it('keeps portrait selection quiet and opens properties and toolpaths explicitly', () => {
        cy.viewport(800, 1280);
        cy.get('[data-testid="gcam-canvas"]').should(($el) =>
            expect($el[0].getBoundingClientRect().width).to.be.greaterThan(650),
        );
        cy.worldClick(20, 50);
        cy.get('[aria-label="Selected shape properties"]').should('not.exist');
        cy.contains('button', /^Properties$/).click();
        cy.get('[aria-label="Selected shape properties"]').should('be.visible');
        cy.get('[aria-label="Close shape properties"]').click();
        cy.contains('button', /^Properties$/).should('be.visible');
        cy.get('[aria-label="Toolpath settings"]').click();
        cy.get('[aria-label="Toolpath settings panel"]').should('be.visible');
        cy.contains('button', /^Outside$/).should('be.visible');
        cy.field('Cut depth', 3);
        cy.get('[aria-label="Close toolpath settings"]').click();
        cy.get('[aria-label="Toolpath settings panel"]').should(
            'not.be.visible',
        );
        cy.get('[aria-label="Toolpath settings"]').click();
        cy.contains('label', 'Cut depth')
            .find('input')
            .should('have.value', '3');
        cy.get('[aria-label="Close toolpath settings"]').click();
        cy.screenshot('tablet-portrait-selection');
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
    });
    for (const [width, height] of [
        [1024, 600],
        [800, 1280],
        [390, 844],
    ]) {
        it(`keeps toolbar controls inside the header at ${width}x${height}`, () => {
            cy.viewport(width, height);
            cy.get('[aria-label="Canvas tools"] button:visible').each(($el) => {
                const rect = $el[0].getBoundingClientRect(),
                    header = $el[0].closest('header').getBoundingClientRect();
                expect(rect.top).to.be.at.least(header.top);
                expect(rect.bottom).to.be.at.most(header.bottom);
                expect(rect.right).to.be.at.most(width);
            });
            if (width >= 768) {
                cy.get('header').should(($header) =>
                    expect(
                        $header[0].getBoundingClientRect().height,
                    ).to.be.at.most(64),
                );
            }
            cy.get('button[aria-label="File"]').click();
            cy.get('[role="menuitem"]')
                .contains('Export Project')
                .should('be.visible');
            cy.get('[aria-label="Select vectors"]').click();
            cy.get('button[aria-label="File"]').should(
                'have.attr',
                'aria-expanded',
                'false',
            );
        });
    }
    it('keeps touch properties explicit at landscape width and enlarges hit areas', () => {
        cy.viewport(1280, 800);
        cy.then(() =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Emulation.setTouchEmulationEnabled',
                params: { enabled: true, maxTouchPoints: 5 },
            }),
        );
        cy.window().should((win) =>
            expect(win.matchMedia('(pointer: coarse)').matches).to.equal(true),
        );
        cy.worldClick(20, 50);
        cy.get('[aria-label="Selected shape properties"]').should('not.exist');
        cy.contains('button', /^Properties$/).should('be.visible');
        cy.get('button:visible').each(($el) => {
            const r = $el[0].getBoundingClientRect();
            expect(
                r.width,
                $el.attr('aria-label') || $el.text(),
            ).to.be.at.least(44);
            expect(r.height).to.be.at.least(44);
        });
        cy.screenshot('tablet-touch-landscape');
        cy.viewport(1024, 360);
        cy.contains('button', /^Properties$/).click();
        cy.get('[aria-label="Selected shape properties"]').should(($panel) => {
            const panel = $panel[0].getBoundingClientRect();
            expect(panel.bottom).to.be.at.most(360);
        });
        cy.get('[aria-label="Selected shape properties"]')
            .contains('button', /^Apply$/)
            .scrollIntoView()
            .should('be.visible');
    });
    it('keeps a single toolbar row with touch targets on a portrait tablet', () => {
        cy.viewport(800, 1280);
        cy.then(() =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Emulation.setTouchEmulationEnabled',
                params: { enabled: true, maxTouchPoints: 5 },
            }),
        );
        cy.get('header').should(($header) =>
            expect($header[0].getBoundingClientRect().height).to.be.at.most(64),
        );
        cy.get('[aria-label="Canvas tools"] button:visible').each(($button) => {
            const rect = $button[0].getBoundingClientRect();
            expect(rect.width).to.be.at.least(44);
            expect(rect.height).to.be.at.least(44);
            expect(rect.right).to.be.at.most(800);
        });
        cy.screenshot('tablet-compact-toolbar');
    });
});
