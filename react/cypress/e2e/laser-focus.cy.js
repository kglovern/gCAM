describe('Laser focus calibration', () => {
    it('exports a fixed-head ramp and a configured zero-power Z sweep', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.contains('button', /^Focus test$/).click();
        cy.contains('button', 'Download focus test').should('be.disabled');
        const field = (label, value) =>
            cy
                .get(`[aria-label="${label}"]`)
                .type(`{selectall}${value}`)
                .blur();
        field('Gap at left end', 10);
        field('Gap at right end', 18);
        cy.contains('button', 'Download focus test').should('be.enabled');
        cy.task('clearDownloads');
        cy.contains('button', /^Save settings$/).click();
        cy.contains('[role="status"]', 'Focus settings saved.').should('exist');
        cy.task('download', '.gcode').should('be.null');
        cy.get('[aria-label="Close focus test"]').click();
        cy.contains('button', /^Focus test$/).click();
        cy.get('[aria-label="Gap at right end"]').should('have.value', '18');
        cy.contains('button', 'Download focus test').click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).not.to.match(/\bZ[+-]?[0-9]|M6/);
            expect(code).to.include('S50');
        });
        cy.get('[aria-label="Focus sample 5"]').check();
        cy.contains('button', 'Record result').click();
        cy.get('[aria-label="Recorded focus result"]').should(
            'contain',
            '14 mm',
        );
        cy.get('[aria-label="Close focus test"]').click();
        cy.contains('button', /^Focus test$/).click();
        cy.get('[aria-label="Gap at left end"]').should('have.value', '10');
        cy.get('[aria-label="Recorded focus result"]').should(
            'contain',
            '14 mm',
        );
        cy.get('[aria-label="Focus test method"]').select('sweep');
        cy.contains('button', 'Download focus test').should('be.disabled');
        cy.get('[aria-label="Motorized Z enabled"]').check();
        field('Minimum work Z', -10);
        field('Maximum work Z', 10);
        field('Start work Z', -2);
        field('End work Z', 2);
        field('Travel and return Z', 5);
        cy.get('[aria-label="Laser focus test"]')
            .contains('summary', 'Marking settings')
            .click();
        cy.get('[aria-label="Perforate focus labels"]').check();
        field('Label cut length', 0.1);
        field('Label skip length', 0.3);
        cy.contains('button', /^Save settings$/).click();
        cy.get('[aria-label="Close focus test"]').click();
        cy.contains('button', /^Focus test$/).click();
        cy.get('[aria-label="Laser focus test"]')
            .contains('summary', 'Marking settings')
            .click();
        cy.get('[aria-label="Perforate focus labels"]').should('be.checked');
        cy.get('[aria-label="Label skip length"]').should('have.value', '0.3');
        cy.get('[aria-label="Laser focus test"]')
            .contains('summary', 'Marking settings')
            .click();
        cy.contains('button', 'Download focus test').should('be.enabled');
        cy.task('clearDownloads');
        cy.contains('button', 'Download focus test').click();
        cy.readDownload('.gcode').then((code) => {
            const moves = code
                .split('\n')
                .filter((line) => /\bZ[+-]?[0-9]/.test(line));
            expect(moves.length).to.be.greaterThan(9);
            expect(moves.every((line) => /^G1 .*F300 S0$/.test(line))).to.equal(
                true,
            );
            expect(moves[moves.length - 1]).to.include('Z5');
        });
        cy.get('[aria-label="Focus Z setup"] summary').click();
        cy.screenshot('laser-focus-test', {
            capture: 'viewport',
            disableTimersAndAnimations: false,
        });
    });
});
