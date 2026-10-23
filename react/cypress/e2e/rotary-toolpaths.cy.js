describe('Rotary operation toolpaths', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
    });
    const tool = (name) => {
        cy.get('[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', `Test ${name}`).click();
    };
    const add = () =>
        cy
            .contains('button', /^Add Toolpath$/)
            .should('be.enabled')
            .click();
    const exportJob = () => {
        cy.task('clearDownloads');
        cy.get('[aria-label="Rotary actions"]')
            .contains('button', 'Export G-code')
            .should('be.enabled')
            .click();
        return cy.readDownload('.nc');
    };
    it('has the same operation picker, with five loaded icons and only relevant fields', () => {
        ['Facing', 'Roughing', 'Finishing', 'Groove', 'Part-off'].forEach(
            (name) => {
                cy.contains('button', new RegExp(`^${name}$`))
                    .find('img')
                    .should('be.visible')
                    .and(($img) =>
                        expect($img[0].naturalWidth).to.be.greaterThan(0),
                    );
            },
        );
        tool('flat');
        cy.get('[aria-label="Roughing allowance"]').should('be.visible');
        cy.get('[aria-label="Finish raster angle"]').should('not.exist');
        cy.contains('button', /^Finishing$/).click();
        cy.get('[aria-label="Finish raster angle"]').should('be.visible');
        cy.get('[aria-label="Roughing allowance"]').should('not.exist');
        cy.get('[aria-label="Rotary actions"]').should('not.exist');
    });
    it('adds independent rough and finish entries, edits, reorders, exports one entry and deletes', () => {
        tool('flat');
        add();
        exportJob().should('contain', '(rough)').and('not.contain', '(finish)');
        add();
        cy.contains('button', /^Finishing$/).click();
        tool('ball');
        add();
        cy.get('[aria-label="Rotary job toolpaths"]')
            .should('contain', '1. Roughing')
            .and('contain', '2. Finishing');
        exportJob().then((code) => {
            expect(code.indexOf('(rough)')).to.be.lessThan(
                code.indexOf('(finish)'),
            );
            expect(code).to.include('T2');
            expect(code).to.include('M6');
        });
        cy.get('[aria-label="Edit Roughing"]').click();
        cy.get('[aria-label="Rotary actions"]').should('not.exist');
        cy.get('[aria-label="Roughing allowance"]').clear().type('1.2').blur();
        cy.contains('button', /^Save Toolpath$/).click();
        cy.get('[aria-label="Move Finishing up"]').click();
        exportJob().then((code) =>
            expect(code.indexOf('(finish)')).to.be.lessThan(
                code.indexOf('(rough)'),
            ),
        );
        cy.get('[aria-label="Export individual toolpaths"]').click();
        cy.task('clearDownloads');
        cy.contains('button', /^1. Finishing$/).click();
        cy.readDownload('.nc')
            .should('contain', '(finish)')
            .and('not.contain', '(rough)');
        cy.get('[aria-label="Delete Roughing"]').click();
        exportJob().should('contain', '(finish)').and('not.contain', '(rough)');
        cy.get('[aria-label="Undo rotary change"]').click();
        cy.get('[aria-label="Rotary job toolpaths"]').should(
            'contain',
            'Roughing',
        );
        cy.get('[aria-label="Toolpaths"]').click();
        cy.snapshot().then((project) => {
            expect(project.rotary.toolpaths).to.have.length(2);
            expect(project.rotary.toolpaths[0].operation).to.equal('finish');
        });
    });
    it('keeps cancelled edits out of the exported job', () => {
        tool('flat');
        add();
        exportJob().then((before) => {
            cy.get('[aria-label="Edit Roughing"]').click();
            cy.get('[aria-label="Rotary actions"]').should('not.exist');
            tool('ball');
            cy.contains('button', /^Cancel Edit$/).click();
            exportJob().should('equal', before);
        });
    });
});
