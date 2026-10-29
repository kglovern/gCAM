describe('Native rotary profile machining', () => {
    for (const pattern of ['along', 'around', 'helix']) {
        it(`machines the reported profile with ${pattern}, reuses it on save, and preserves it on edit`, () => {
            cy.freshProject();
            cy.get('[aria-label="Rotary"]').click();
            cy.get('[aria-label="Import lathe profile file"]').selectFile(
                'cypress/fixtures/rotary-profile-regression.json',
                { force: true },
            );
            cy.get('[aria-label="Stock length"]').clear().type('200').blur();
            cy.contains('button', /^Finishing$/).click();
            cy.get('[aria-label="Tool library slot"]').click();
            cy.contains('[role="option"]', 'Test flat').click();
            cy.get('[aria-label="Mesh strategy"]').select(pattern);
            cy.contains('button', /^Add Toolpath$/, { timeout: 90000 })
                .should('be.enabled')
                .click();
            cy.contains('Job toolpaths (1)').should('be.visible');
            cy.get('[aria-label="Rotary toolpath settings"]').then(($sidebar) =>
                expect($sidebar.text()).not.to.include('Calculating toolpath'),
            );
            cy.task('clearDownloads');
            cy.get('[aria-label="Rotary actions"]')
                .contains('button', 'Export G-code')
                .should('be.enabled')
                .click();
            cy.readDownload('.gcode').then((code) => {
                expect(code).to.include('G93');
                expect(code).to.include('G94');
                expect(code).not.to.include('G0X0.000A0.000');
                const moves = code
                    .split(/\r?\n/)
                    .filter((l) => /^G1X/.test(l))
                    .map((l) => ({
                        x: Number(l.match(/X(-?[\d.]+)/)[1]),
                        a: Number(l.match(/A(-?[\d.]+)/)[1]),
                        y: Number(l.match(/Y(-?[\d.]+)/)[1]),
                        f: Number(l.match(/F([\d.]+)/)[1]),
                    }));
                expect(
                    moves.every((m) => m.y === 0 && m.f > 0 && m.x >= 25.5),
                ).to.equal(true);
                expect(new Set(moves.map((m) => m.a)).size).to.be.greaterThan(
                    4,
                );
                expect(
                    moves.filter(
                        (m, i) =>
                            i > 0 &&
                            (pattern === 'along'
                                ? m.x !== moves[i - 1].x &&
                                  m.a === moves[i - 1].a
                                : pattern === 'around'
                                  ? m.x === moves[i - 1].x &&
                                    m.a !== moves[i - 1].a
                                  : m.x !== moves[i - 1].x &&
                                    m.a !== moves[i - 1].a),
                    ).length,
                ).to.be.greaterThan(100);
            });
            cy.get('[aria-label="Edit Finishing"]').click();
            cy.get('[aria-label="Mesh strategy"]').should(
                'have.value',
                pattern,
            );
            cy.contains('button', /^Save Toolpath$/).should('be.enabled');
            cy.get('[aria-label="Rotary actions"]').should('not.exist');
            cy.snapshot().then((project) => {
                expect(project.rotary.operation).to.equal('finish');
                expect(project.rotary.toolpathEditorOpen).to.equal(true);
                expect(project.rotary.editingToolpathId).to.equal(
                    project.rotary.toolpaths[0].id,
                );
            });
        });
    }
    it('changing from Helix finishing to roughing selects a valid pattern', () => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
        cy.contains('button', /^Finishing$/).click();
        cy.get('[aria-label="Mesh strategy"]').select('helix');
        cy.contains('button', /^Roughing$/).click();
        cy.get('[aria-label="Mesh strategy"]').should('have.value', 'around');
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test flat').click();
        cy.contains('button', /^Add Toolpath$/, { timeout: 60000 }).should(
            'be.enabled',
        );
    });
});
