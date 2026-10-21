describe('Rotary workspace', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
    });
    const step = (name) =>
        cy
            .get('[aria-label="Rotary workflow"]')
            .contains('[role="tab"]', name)
            .click();
    const footer = () => cy.get('[aria-label="Rotary actions"]');
    it('keeps the preview and primary action visible while moving between stages', () => {
        cy.viewport(1280, 800);
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        footer().contains('button', 'Continue to Shape').click();
        cy.get('[aria-label="Load template"]').select('handle');
        step('Setup');
        cy.get('[aria-label="Stock length"]').should('have.value', '100');
        step('Shape');
        cy.get('[aria-label="Profile editor"]').should('be.visible');
        footer().should(($footer) =>
            expect($footer[0].getBoundingClientRect().bottom).to.be.at.most(
                800,
            ),
        );
        cy.get('[aria-label="Rotary preview"]').should('be.visible');
        cy.document().then((doc) =>
            expect(doc.documentElement.scrollWidth).to.equal(1280),
        );
        cy.screenshot('rotary-shape-landscape', { capture: 'viewport' });
    });
    it('picks points accurately and keeps point fields visible while editing', () => {
        cy.viewport(1280, 800);
        step('Shape');
        cy.get('[aria-label="Profile editor"]').should(($svg) => {
            const [, , width, height] = $svg
                .attr('viewBox')
                .split(' ')
                .map(Number);
            const rect = $svg[0].getBoundingClientRect();
            expect(width).to.be.closeTo(rect.width, 0.1);
            expect(height).to.be.closeTo(rect.height, 0.1);
        });
        cy.get('[aria-label="Profile editor"] circle[data-i]:not([data-h])')
            .first()
            .click();
        cy.get('[aria-label="Node X"]')
            .should('have.value', '20')
            .should(($input) =>
                expect($input[0].getBoundingClientRect().bottom).to.be.lessThan(
                    800,
                ),
            );
        const checkCurveAlignment = () =>
            cy.get('[aria-label="Profile editor"]').should(($svg) => {
                const path = $svg[0].querySelector('path');
                const node = $svg[0].querySelector(
                    'circle[data-i]:not([data-h])',
                );
                const start = path.getPointAtLength(0);
                expect(start.x).to.be.closeTo(
                    Number(node.getAttribute('cx')),
                    0.1,
                );
                expect(start.y).to.be.closeTo(
                    Number(node.getAttribute('cy')),
                    0.1,
                );
            });
        checkCurveAlignment();
        cy.viewport(1180, 760);
        checkCurveAlignment();
        cy.get('[aria-label="Profile editor"]').type('{rightarrow}');
        cy.get('[aria-label="Node X"]').should('have.value', '20.5');
    });
    it('groups stock field typing into one undoable change', () => {
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        cy.get('[aria-label="Undo rotary change"]').click();
        cy.get('[aria-label="Stock length"]').should('have.value', '90');
        cy.get('[aria-label="Redo rotary change"]').click();
        cy.get('[aria-label="Stock length"]').should('have.value', '100');
    });
    it('requires regeneration after editing a generated rotary job', () => {
        step('Toolpaths');
        footer().contains('button', 'Export G-code').should('be.disabled');
        footer().contains('button', 'Generate G-code').click();
        cy.task('clearDownloads');
        footer()
            .contains('button', 'Export G-code')
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((text) => {
            expect(text).to.include('G21');
            expect(text).to.match(/A-?\d/);
        });
        step('Setup');
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        step('Toolpaths');
        footer().contains('button', 'Export G-code').should('be.disabled');
        footer().contains('button', 'Generate G-code').click();
        footer().contains('button', 'Export G-code').should('be.enabled');
    });
    it('lets users enter STL mode without a picker and reports invalid files', () => {
        step('Shape');
        cy.contains('button', 'Import an STL').click();
        cy.contains('button', /^Import STL$/).should('be.visible');
        cy.get('[aria-label="Import STL file"]').selectFile(
            {
                contents: Cypress.Buffer.from('invalid'),
                fileName: 'invalid.stl',
                mimeType: 'model/stl',
            },
            { force: true },
        );
        cy.get('[role="alert"]').should('be.visible');
        step('Toolpaths');
        footer().contains('button', 'Generate G-code').should('be.disabled');
        cy.get('[aria-label="Checks"]').should('contain.text', 'Import an STL');
    });
    it('exports a rotary-only project without requiring a 2D drawing', () => {
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        cy.get('[aria-label="Toolpaths"]').click();
        cy.snapshot().then((project) => {
            expect(project.loops).to.have.length(0);
            expect(project.rotary.stock.length).to.equal(100);
            expect(project.rotary.points.length).to.be.greaterThan(1);
        });
    });
    it('imports an STL and retains it while visiting setup and toolpaths', () => {
        step('Shape');
        cy.contains('button', 'Import an STL').click();
        cy.get('[aria-label="Import STL file"]').selectFile(
            'cypress/fixtures/relief.stl',
            { force: true },
        );
        cy.get('[aria-label="Rotary shape"]').should('contain.text', 'relief');
        step('Setup');
        step('Shape');
        cy.contains('button', 'Import an STL').should(
            'have.attr',
            'aria-pressed',
            'true',
        );
        cy.get('[aria-label="Rotary shape"]').should(
            'contain.text',
            'Triangles',
        );
    });
    it('displays stock and operation fields in the chosen unit system', () => {
        cy.window().then((win) =>
            win.localStorage.setItem('gcam.units', 'imperial'),
        );
        cy.reload();
        cy.get('[aria-label="Rotary"]').click();
        cy.get('[aria-label="Stock diameter"]').should('have.value', '1');
        cy.get('[aria-label="Stock diameter"]')
            .parent()
            .should('contain.text', 'in');
        step('Toolpaths');
        cy.get('[aria-label="Roughing allowance"]').should(
            'have.value',
            '0.031',
        );
        cy.get('[aria-label="Roughing allowance"]')
            .parent()
            .should('contain.text', 'in');
    });
    it('preserves field drafts across stages and fits a portrait tablet', () => {
        cy.viewport(800, 1280);
        step('Toolpaths');
        cy.contains('summary', 'Square sections').click();
        cy.get('[aria-label="Pommel start"]').clear().type('25').blur();
        step('Shape');
        step('Toolpaths');
        cy.get('[aria-label="Pommel start"]').should('have.value', '25');
        footer().should(($footer) =>
            expect($footer[0].getBoundingClientRect().bottom).to.be.at.most(
                1280,
            ),
        );
        cy.document().then((doc) =>
            expect(doc.documentElement.scrollWidth).to.equal(800),
        );
        cy.screenshot('rotary-portrait', { capture: 'viewport' });
    });
});
