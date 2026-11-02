describe('Large flat laser raster', () => {
    it('builds and exports an image above the previous sample limit from the form', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        cy.get('[aria-label="Resolution (DPI)"]')
            .type('{selectall}508')
            .blur()
            .should('have.value', '508');
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/, {
            timeout: 60000,
        }).should('be.enabled');
        cy.snapshot().then((project) => {
            expect(project.stack).to.have.length(1);
            const path = project.stack[0];
            expect(path.args.laserSpot).to.be.closeTo(0.05, 1e-10);
            const image = project.bitmaps[0];
            const samples =
                Math.ceil(image.w / path.args.laserSpot) *
                Math.ceil(image.h / path.args.laserSpot);
            expect(samples).to.be.greaterThan(2000000);
            expect(path.toolpath.laserPaths.length).to.be.greaterThan(500);
            expect(path.toolpath).not.to.have.property('sourceEntities');
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('M4 S0');
            expect(code).to.include('S500');
            expect(code).to.include('M5');
            expect(code).not.to.match(/G[01] .*Z/);
        });
        cy.screenshot('laser-large-raster', { capture: 'viewport' });
    });
});
