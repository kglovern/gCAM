const dialog = '[role="dialog"][aria-label="Adjust laser image"]';
const ready = () =>
    cy
        .get(dialog)
        .contains('button', 'Apply image settings', { timeout: 30000 })
        .should('be.enabled');
it('previews adjustable image enhancement, saves it in presets and generates the configured raster', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('laser-image-modes.png');
    cy.contains('button', 'Engrave image').click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.contains('label', /^Resolution \(DPI\)/)
        .find('input[type="number"]')
        .type('{selectall}127')
        .blur();
    cy.contains('button', /^Adjust image/).click();
    ready();
    cy.get(dialog)
        .find('label')
        .filter((_, el) => el.textContent.trim() === 'Sharpening')
        .find('input')
        .type('{selectall}1.5')
        .blur();
    cy.get(`${dialog} [aria-label="Image filter radius"]`)
        .type('{selectall}4')
        .blur();
    cy.get(`${dialog} [aria-label="Sharpening denoise"]`)
        .type('{selectall}0.02')
        .blur();
    ready();
    cy.get(dialog).contains('summary', 'Image presets').click();
    cy.get(`${dialog} [aria-label="Image preset name"]`).type(
        'Wide edge enhancement',
    );
    cy.get(dialog).contains('button', 'Save image preset').click();
    cy.get(`${dialog} [aria-label="Image filter radius"]`)
        .type('{selectall}2')
        .blur();
    cy.get(`${dialog} [aria-label="Sharpening denoise"]`)
        .type('{selectall}0.1')
        .blur();
    cy.get(dialog).contains('button', 'Apply image preset').click();
    cy.get(`${dialog} [aria-label="Image filter radius"]`).should(
        'have.value',
        '4',
    );
    cy.get(`${dialog} [aria-label="Sharpening denoise"]`).should(
        'have.value',
        '0.02',
    );
    cy.get(dialog).contains('summary', 'Image presets').click();
    ready();
    cy.get(`${dialog} canvas[aria-label="Source region"]`).scrollIntoView();
    cy.screenshot('laser-adjustable-enhancement', { capture: 'viewport' });
    cy.get(dialog).contains('button', 'Apply image settings').click();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.stack[0].args.laserOptions).to.include({
            sharpening: 1.5,
            filterRadius: 4,
            sharpeningDenoise: 0.02,
        });
        expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
    });
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => expect(code).to.include('S250'));
});
