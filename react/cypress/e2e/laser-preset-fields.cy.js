const dialog = '[role="dialog"][aria-label="Adjust laser image"]';
const ready = () =>
    cy
        .get(dialog)
        .contains('button', 'Apply image settings', { timeout: 30000 })
        .should('be.enabled');
const numeric = (label) =>
    cy
        .get(dialog)
        .find('label')
        .filter((_, el) => el.textContent.trim() === label)
        .find('input[type="number"]');
it('saves only chosen image fields and preserves unrelated settings through job generation and reload', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false, multipleSelection: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('laser-image-modes.png');
    cy.contains('button', 'Engrave image').click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.contains('button', 'Adjust image…').click();
    ready();
    numeric('Contrast').type('{selectall}0.4').blur();
    cy.get(dialog).contains('summary', 'Image presets').click();
    cy.get(dialog).contains('summary', 'Settings to save').click();
    cy.get(dialog)
        .contains('button', /^None$/)
        .click();
    cy.get(dialog)
        .contains('button', 'Save image preset')
        .should('be.disabled');
    cy.get(`${dialog} [aria-label="Include Contrast"]`).check();
    cy.get(`${dialog} [aria-label="Image preset name"]`).type('Contrast only');
    cy.get(dialog).contains('button', 'Save image preset').click();
    cy.window().then((win) => {
        const saved = JSON.parse(
            win.localStorage.getItem('gcam.laserImagePresets.v2'),
        );
        expect(saved).to.have.length(1);
        expect(saved[0].options).to.deep.equal({ contrast: 0.4 });
        expect(saved[0]).not.to.have.property('gamma');
        expect(saved[0]).not.to.have.property('interval');
    });
    numeric('Contrast').type('{selectall}0.1').blur();
    numeric('Brightness').type('{selectall}0.2').blur();
    cy.get('[aria-label="Adjustment gamma"]').type('{selectall}1.5').blur();
    cy.get(dialog)
        .contains('label', 'Resolution (DPI)')
        .find('input')
        .type('{selectall}127')
        .blur();
    cy.get(dialog).contains('button', 'Apply image preset').click();
    numeric('Contrast').should('have.value', '0.4');
    numeric('Brightness').should('have.value', '0.2');
    cy.get('[aria-label="Adjustment gamma"]').should('have.value', '1.5');
    cy.get(dialog)
        .contains('label', 'Resolution (DPI)')
        .find('input')
        .should('have.value', '127');
    ready();
    cy.screenshot('laser-selective-image-preset', { capture: 'viewport' });
    cy.get(dialog).contains('button', 'Apply image settings').click();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    let savedProject;
    cy.snapshot().then((p) => {
        savedProject = p;
        expect(p.stack[0].args.laserGamma).to.equal(1.5);
        expect(p.stack[0].args.laserSpot).to.be.closeTo(0.2, 1e-9);
        expect(p.stack[0].args.laserOptions.contrast).to.equal(0.4);
        expect(p.stack[0].args.laserOptions.brightness).to.equal(0.2);
        expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    JSON.stringify({
                        kind: 'gcam.project',
                        version: 2,
                        exportedAt: new Date().toISOString(),
                        fileName: 'Preset check',
                        snapshot: savedProject,
                    }),
                ),
                fileName: 'preset-check.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.worldClick(100, 100);
    cy.get('button[aria-label^="Edit Laser Raster"]', {
        timeout: 30000,
    }).click();
    cy.contains('summary', 'Image presets').click();
    cy.get('[aria-label="Image preset"]').select('Contrast only');
    cy.contains('summary', 'Settings to save').click();
    cy.get('[aria-label="Include Contrast"]').should('be.checked');
    cy.get('[aria-label="Include Gamma"]').should('not.be.checked');
    cy.get('[aria-label="Include Resolution (DPI)"]').should('not.be.checked');
});
