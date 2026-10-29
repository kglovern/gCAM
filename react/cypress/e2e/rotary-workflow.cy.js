describe('Rotary workspace', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
    });
    const addRoughing = () => {
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.contains('button', /^Add Toolpath$/)
            .should('be.enabled')
            .click();
    };
    const footer = () => cy.get('[aria-label="Rotary actions"]');
    it('keeps design and toolpath settings on one page', () => {
        cy.viewport(1280, 800);
        cy.get('[aria-label="Rotary design"]')
            .find('[aria-label="Stock length"]')
            .should('not.exist');
        cy.get('[aria-label="Rotary job stock"]')
            .should('be.visible')
            .within(() => {
                cy.get('[aria-label="Stock length"]').should('exist');
                cy.get('[aria-label="Stock diameter"]').should('exist');
                cy.get('[aria-label="Rotary stock material"]').should('exist');
            });
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        cy.get('[aria-label="Load template"]').select('cabinetKnob');
        cy.get('[aria-label="Stock length"]')
            .invoke('val')
            .should((value) => {
                expect(Number(value)).to.be.at.most(100);
                expect(Number(value)).to.be.greaterThan(40);
            });
        cy.get('[aria-label="Stock diameter"]').should('have.value', '50');
        cy.get('[aria-label="Profile editor"]').should('be.visible');
        footer().should('not.exist');
        cy.get('[aria-label="Rotary design"]').should('be.visible');
        cy.get('[aria-label="Design name"]').should('not.exist');
        cy.get('[aria-label="Rotary tools"]')
            .should('be.visible')
            .within(() => {
                cy.get('[aria-label="Undo rotary change"]').should('exist');
                cy.get('[aria-label="File"]').should('exist');
            });
        cy.contains('summary', 'G-code preview').should('not.exist');
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.get('[aria-label="Operations"]')
            .parents('section')
            .should('contain.text', 'Toolpath settings');
        cy.document().then((doc) =>
            expect(doc.documentElement.scrollWidth).to.equal(1280),
        );
        addRoughing();
        footer().find('button').should('have.length', 3);
        cy.screenshot('rotary-shape-landscape', { capture: 'viewport' });
    });
    it('fits stock and resets profile zoom when loading a template', () => {
        cy.get('[aria-label="Profile editor"]').then(($svg) => {
            const old = $svg[0];
            const rect = old.getBoundingClientRect();
            cy.wrap($svg).trigger('wheel', {
                deltaY: -500,
                clientX: rect.left + 100,
                clientY: rect.top + 100,
            });
            cy.get('[aria-label="Load template"]').select('bat');
            cy.get('[aria-label="Stock length"]')
                .invoke('val')
                .should((value) =>
                    expect(Number(value)).to.be.within(510, 546),
                );
            cy.get('[aria-label="Stock diameter"]').should('have.value', '50');
            cy.get('[aria-label="Profile editor"]').should(($next) =>
                expect($next[0]).not.to.equal(old),
            );
        });
    });
    it('picks points accurately and keeps point fields visible while editing', () => {
        cy.viewport(1280, 800);
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
            .scrollIntoView()
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
        cy.get('[aria-label="Profile editor"]').should(($svg) => {
            const [, , width, height] = $svg
                .attr('viewBox')
                .split(' ')
                .map(Number);
            const lines = [...$svg[0].querySelectorAll('line')];
            const vertical = lines.filter(
                (line) =>
                    Number(line.getAttribute('y1')) === 22 &&
                    Number(line.getAttribute('y2')) === height - 24,
            );
            const horizontal = lines.filter(
                (line) =>
                    Number(line.getAttribute('x1')) === 34 &&
                    Number(line.getAttribute('x2')) === width - 10 &&
                    line.getAttribute('y1') === line.getAttribute('y2'),
            );
            expect(
                Number(vertical[1].getAttribute('x1')) -
                    Number(vertical[0].getAttribute('x1')),
            ).to.be.closeTo(
                Number(horizontal[0].getAttribute('y1')) -
                    Number(horizontal[1].getAttribute('y1')),
                0.1,
            );
        });
        cy.viewport(1180, 760);
        checkCurveAlignment();
        cy.get('[aria-label="Profile editor"]').type('{rightarrow}');
        cy.get('[aria-label="Node X"]').should('have.value', '20.5');
    });
    it('groups stock field typing into one undoable change', () => {
        cy.get('[aria-label="Stock length"]')
            .invoke('val')
            .then((initial) => {
                cy.get('[aria-label="Stock length"]')
                    .clear()
                    .type('100')
                    .blur();
                cy.get('[aria-label="Undo rotary change"]').click();
                cy.get('[aria-label="Stock length"]').should(
                    'have.value',
                    initial,
                );
                cy.get('[aria-label="Redo rotary change"]').click();
                cy.get('[aria-label="Stock length"]').should(
                    'have.value',
                    '100',
                );
            });
    });
    it('exports automatically regenerated G-code after edits', () => {
        addRoughing();
        cy.task('clearDownloads');
        footer()
            .contains('button', 'Export G-code')
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((text) => {
            expect(text).to.include('G21');
            expect(text).to.match(/A-?\d/);
        });
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        cy.task('clearDownloads');
        footer()
            .contains('button', 'Export G-code')
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').should('contain', 'Stock L100');
    });
    it('keeps rotary G-code in Simulation current after changes', () => {
        addRoughing();
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Rotary simulation"]').should('be.visible');
        cy.get('[aria-label="Rotary simulation"] pre').should(
            'contain.text',
            '(rough)',
        );
        cy.get('[aria-label="Rotary"]').click();
        footer().contains('button', 'Export G-code').should('be.enabled');
        cy.get('[aria-label="Stock length"]').clear().type('100').blur();
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Rotary simulation"] pre').should(
            'contain.text',
            'Stock L100',
        );
        cy.get('[aria-label="Toolpaths"]').click();
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Rotary simulation"]').should('not.exist');
    });
    it('lets users enter STL mode without a picker and reports invalid files', () => {
        cy.contains('[role="tab"]', /^STL$/).click();
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
        footer().should('not.exist');
        cy.contains('Import your STL on the left').should('be.visible');
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
    it('imports an STL and keeps its source tab active', () => {
        cy.contains('[role="tab"]', /^STL$/).click();
        cy.get('[aria-label="Import STL file"]').selectFile(
            'cypress/fixtures/relief.stl',
            { force: true },
        );
        cy.get('[aria-label="Model units"]').select('mm');
        cy.contains('button', 'Continue to model setup').click();
        cy.get('[aria-label="Rotary shape"]').should('contain.text', 'relief');
        cy.contains('[role="tab"]', /^STL$/).should(
            'have.attr',
            'aria-selected',
            'true',
        );
        cy.get('[aria-label="Rotary shape"]').should(
            'contain.text',
            'maximum diameter',
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
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.get('[aria-label="Roughing allowance"]').should(
            'have.value',
            '0.031',
        );
        cy.get('[aria-label="Roughing allowance"]')
            .parent()
            .should('contain.text', 'in');
    });
    it('preserves operation drafts with the full sidebar on a portrait tablet', () => {
        cy.viewport(800, 1280);
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.get('[aria-label="Pommel start"]').clear().type('25').blur();
        cy.get('[aria-label="Pommel start"]').should('have.value', '25');
        footer().should('not.exist');
        cy.document().then((doc) =>
            expect(doc.documentElement.scrollWidth).to.equal(800),
        );
        cy.screenshot('rotary-portrait', { capture: 'viewport' });
    });
});
