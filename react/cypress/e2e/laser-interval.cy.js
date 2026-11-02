describe('Flat laser interval calibration', () => {
    it('previews a dither sheet, exports labels and applies a physical-result selection', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1200').blur();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('button', /^Interval test$/).click();
        cy.get('[aria-label="Interval pattern"]').select('dither');
        cy.get('[aria-label="Interval test feed"]')
            .type('{selectall}1300')
            .blur();
        cy.contains('button', 'Download interval test').should('be.enabled');
        cy.task('clearDownloads');
        cy.get('[aria-label="Laser interval test"]')
            .contains('button', /^Save settings$/)
            .click();
        cy.task('download', '.gcode').should('be.null');
        cy.get('[aria-label="Close interval test"]').click();
        cy.contains('button', /^Interval test$/).click();
        cy.get('[aria-label="Interval pattern"]').should(
            'have.value',
            'dither',
        );
        cy.get('[aria-label="Interval test feed"]').should(
            'have.value',
            '1300',
        );
        cy.get('[aria-label="Laser interval test"]').should('be.visible');
        cy.screenshot('laser-interval-test', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button', 'Download interval test').click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('Interval test');
            expect(code).to.include('F1300');
            expect(code).to.include('S250');
            expect(code).to.include('S50');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.get('[aria-label="Interval test results"]')
            .contains('button', '0.12 mm')
            .click();
        cy.get('[aria-label="Laser interval test"]').should('not.exist');
        cy.get('[aria-label="Laser line interval"]').should(
            'have.value',
            '0.12',
        );
        cy.contains('button', /^Interval test$/).click();
        cy.get('[aria-label="Recorded interval result"]').should(
            'contain',
            '0.12 mm',
        );
        cy.get('[aria-label="Close interval test"]').click();
        cy.contains('button', 'Save as suggestion').click();
        cy.window().then((win) => {
            const saved = JSON.parse(
                win.localStorage.getItem('gcam.laserRecipes.v1'),
            )[0];
            expect(saved.interval).to.equal(0.12);
            expect(saved.feed).to.equal(1300);
            expect(saved.power).to.equal(250);
            expect(saved.options.passes).to.equal(1);
            expect(saved.source).to.equal('User calibrated');
        });
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserSpot).to.equal(0.12);
            expect(p.stack[0].args.laserFeed).to.equal(1300);
        });
    });
});
