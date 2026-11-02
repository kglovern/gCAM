describe('Laser material editing', () => {
    it('edits the library independently, then explicitly applies and saves the revised values', () => {
        cy.freshProject({ tools: false });
        cy.viewport(1280, 900);
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1200').blur();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.get('[aria-label="Laser line interval"]')
            .type('{selectall}1')
            .blur();
        cy.get('[aria-label="Save engraving for any thickness"]').check();
        cy.contains('button', 'Save as suggestion').click();
        cy.contains('summary', 'Material library').click();
        cy.contains('button', /^Edit settings$/).click();
        cy.get('[aria-label="Recipe any thickness"]').should('be.checked');
        cy.get('[aria-label="Recipe speed"]').type('{selectall}1800').blur();
        cy.get('[aria-label="Recipe power percent"]')
            .type('{selectall}30')
            .blur();
        cy.get('[aria-label="Recipe passes"]').type('{selectall}3').blur();
        cy.get('[aria-label="Recipe interval"]').type('{selectall}0.5').blur();
        cy.contains('summary', 'Material library').scrollIntoView();
        cy.screenshot('laser-material-edit', { capture: 'viewport' });
        cy.contains('button', /^Save settings$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').should('have.value', '1200');
        cy.get('[aria-label="Laser power percent"]').should('have.value', '25');
        cy.contains('button', 'Use settings').click();
        cy.contains('summary', /^Job stock/).click();
        cy.get('[aria-label="Stock Thickness (mm)"]')
            .type('{selectall}6')
            .blur();
        cy.contains('button', 'Use settings').should('be.enabled');
        cy.task('clearDownloads');
        cy.contains('button', 'Export library').click();
        cy.readDownload('.json').then((raw) => {
            expect(JSON.parse(raw).recipes[0].thicknessIndependent).to.equal(
                true,
            );
        });
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').should('have.value', '1800');
        cy.get('[aria-label="Laser power percent"]').should('have.value', '30');
        cy.get('[aria-label="Laser passes"]').should('have.value', '3');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((snapshot) => {
            const path = snapshot.stack[0].toolpath;
            expect(path.laserFeed).to.equal(1800);
            expect(path.laserPower).to.equal(300);
            expect(path.laserOptions.passes).to.equal(3);
        });
        cy.reload();
        cy.window().then((win) => {
            const recipe = JSON.parse(
                win.localStorage.getItem('gcam.laserRecipes.v1'),
            )[0];
            expect(recipe.feed).to.equal(1800);
            expect(recipe.interval).to.equal(0.5);
            expect(recipe.source).to.equal('User-edited settings');
            expect(recipe.thicknessIndependent).to.equal(true);
        });
    });
});
