describe('Rotary finishing with overhangs', () => {
    for (const pattern of ['around', 'along', 'helix'])
        it(`exports queen ${pattern} finishing from the original mesh`, () => {
            cy.freshProject();
            cy.window().then((win) => {
                const library = JSON.parse(
                    win.localStorage.getItem('gcam.myEndmills.v1'),
                );
                library.slots.find(
                    (slot) => slot.toolType === 'ball',
                ).cuttingDiameterMm = 3.175;
                win.localStorage.setItem(
                    'gcam.myEndmills.v1',
                    JSON.stringify(library),
                );
            });
            cy.reload();
            cy.get('[aria-label="Rotary"]').click();
            cy.contains('[role="tab"]', 'STL').click();
            cy.get('[aria-label="Import STL file"]').selectFile(
                'cypress/fixtures/rotary-queen.stl',
                { force: true },
            );
            cy.get('[aria-label="Model units"]').select('mm');
            cy.contains('button', 'Continue to model setup').click();
            cy.contains('button', /^Finishing$/).click();
            cy.get('[aria-label="Mesh strategy"]')
                .should('have.value', 'around')
                .select(pattern);
            cy.get('[aria-label="Tool library slot"]').click();
            cy.contains('[role="option"]', 'Test ball').click();
            cy.contains('button', /^Building… \d+%$/).should('be.disabled');
            cy.contains('button', /^Add Toolpath$/, { timeout: 90000 })
                .should('be.enabled')
                .click();
            cy.contains('Job toolpaths (1)').should('be.visible');
            cy.get('[aria-label="Rotary toolpath settings"]').then(($sidebar) =>
                expect($sidebar.text()).not.to.include('Calculating toolpath'),
            );
            cy.task('clearDownloads');
            cy.get('[aria-label="Rotary actions"]')
                .contains('button', 'Export G-code', { timeout: 90000 })
                .should('be.enabled')
                .click();
            cy.readDownload('.gcode').then((code) => {
                expect(code).to.include('(finish)');
                expect(code).to.include('G93');
                expect(code).to.match(/G1X[^\r\n]*Y/);
                const moves = code
                    .split(/\r?\n/)
                    .filter((line) => /^G1X/.test(line))
                    .map((line) => ({
                        x: Number(line.match(/X(-?[\d.]+)/)[1]),
                        y: Number(line.match(/Y(-?[\d.]+)/)[1]),
                        a: Number(line.match(/A(-?[\d.]+)/)[1]),
                    }));
                expect(moves.every((m) => m.y === 0)).to.equal(true);
                expect(
                    moves.some(
                        (m, i) =>
                            i &&
                            (pattern === 'around'
                                ? m.x === moves[i - 1].x &&
                                  m.a !== moves[i - 1].a
                                : pattern === 'along'
                                  ? m.x !== moves[i - 1].x &&
                                    m.a === moves[i - 1].a
                                  : m.x !== moves[i - 1].x &&
                                    m.a !== moves[i - 1].a),
                    ),
                ).to.equal(true);
            });
        });
});
