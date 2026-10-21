describe('Image workflows', () => {
    beforeEach(() => cy.freshProject());
    it('traces a bitmap, replaces it with vectors, and machines the result', () => {
        cy.importDesign('contrast.png');
        cy.contains('button', 'Convert to vector').click();
        cy.contains('button', /^Import \(/, { timeout: 30000 })
            .should('be.enabled')
            .click();
        cy.snapshot().then((project) => {
            expect(project.bitmaps).to.have.length(0);
            expect(project.loops.length).to.be.greaterThan(0);
            expect(project.selected.length).to.equal(project.loops.length);
        });
        cy.addOperation('Engrave');
    });
    for (const label of ['Laser Raster', 'Wavy', 'Halftone']) {
        it(`imports and machines an image using ${label}`, () => {
            cy.importDesign('contrast.png');
            cy.contains('button', 'Use as bitmap').click();
            cy.snapshot().then((project) =>
                expect(project.bitmaps).to.have.length(1),
            );
            cy.addOperation(label);
        });
    }
});
describe('Vector operations', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
    });
    for (const label of [
        'Outside',
        'Inside',
        'Pocket',
        'Engrave',
        'Chamfer',
        'V-Carve',
        'V-Bit Countersink',
        'Texture Fill',
        'Laser Cut',
    ]) {
        it(`generates and exports ${label}`, () => {
            cy.worldClick(
                label === 'V-Bit Countersink' ? 33 : 20,
                label === 'V-Bit Countersink' ? 30 : 50,
            );
            cy.addOperation(label);
        });
    }
    it('generates and exports crosshatch texture', () => {
        cy.worldClick(20, 50);
        cy.addOperation('Texture Fill', { texture: 'crosshatch' });
    });
});
describe('Retained mesh operations', () => {
    beforeEach(() => cy.freshProject());
    for (const extension of ['stl', 'obj']) {
        for (const label of [
            '3D Surface Clear',
            '3D Surface Finish',
            '3D Waterline Finish',
        ]) {
            it(`${extension.toUpperCase()} → ${label}`, () => {
                cy.importDesign(`relief.${extension}`);
                cy.get('[aria-label="Model units"]').select('mm');
                cy.contains('button', 'Continue to model setup').click();
                cy.contains('button', 'Place 3D model', {
                    timeout: 30000,
                }).click();
                cy.snapshot().then((project) => {
                    expect(project.bitmaps).to.have.length(1);
                    expect(project.bitmaps[0].surfaceMesh).to.exist;
                });
                cy.addOperation(
                    label,
                    label === '3D Surface Clear'
                        ? { rectangle: true }
                        : {
                              fit:
                                  label === '3D Surface Finish'
                                      ? 'z'
                                      : 'uniform',
                          },
                );
            });
        }
    }
});
describe('Send to gSender', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
    });
    it('posts the exported program to the gSender handoff listener', () => {
        cy.intercept('POST', 'http://127.0.0.1:47820/gcam/v1/load', {
            statusCode: 202,
            body: { accepted: true, name: 'vectors.nc' },
        }).as('handoff');
        cy.addOperation('Engrave');
        cy.contains('button', /^Send to gSender$/).click();
        cy.wait('@handoff').then(({ request }) => {
            expect(request.body.name).to.equal('vectors.nc');
            expect(request.body.gcode).to.match(/G[01]/);
        });
        cy.contains('button', 'Sent to gSender');
    });
    it('explains when gSender is running a job', () => {
        cy.intercept('POST', 'http://127.0.0.1:47820/gcam/v1/load', {
            statusCode: 409,
            body: { error: 'busy' },
        });
        cy.addOperation('Engrave');
        cy.contains('button', /^Send to gSender$/).click();
        cy.contains('[role="alert"]', 'gSender is running a job');
    });
});
