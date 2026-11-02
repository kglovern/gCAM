describe('Laser artistic image modes', () => {
    it('generates halftone dots and edge-only engraving from the same source', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-image-modes.png');
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1200').blur();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('label', /^Resolution\ \(DPI\)$/)
            .find('input')
            .type('{selectall}254')
            .blur();
        cy.contains('label', /^Image mode/)
            .find('select')
            .select('halftone');
        cy.get('[aria-label="Halftone dot spacing"]')
            .type('{selectall}2')
            .blur();
        cy.get('[aria-label="Halftone pattern angle"]')
            .type('{selectall}30')
            .blur();
        cy.contains('label', /^Gamma$/)
            .find('input')
            .type('{selectall}1.4')
            .blur();
        cy.contains('summary', 'Image presets').click();
        cy.get('[aria-label="Image preset name"]').type('Round dots');
        cy.contains('button', 'Save image preset').click();
        cy.contains('label', /^Image mode/)
            .find('select')
            .select('edge');
        cy.contains('label', /^Gamma$/)
            .find('input')
            .type('{selectall}2')
            .blur();
        cy.contains('button', 'Apply image preset').click();
        cy.contains('label', /^Image mode/)
            .find('select')
            .should('have.value', 'halftone');
        cy.contains('label', /^Gamma$/)
            .find('input')
            .should('have.value', '1.4');
        cy.get('[aria-label="Halftone dot spacing"]').should('have.value', '2');
        cy.task('clearDownloads');
        cy.contains('button', 'Export presets').click();
        cy.readDownload('.json').then((text) => {
            const saved = JSON.parse(text);
            expect(saved.format).to.equal('gcam-image-presets');
            expect(saved.presets[0].gamma).to.equal(1.4);
            expect(saved.presets[0].options).not.to.have.property(
                'scanAlignment',
            );
            expect(saved.presets[0].options).not.to.have.property('passes');
            cy.get('[aria-label="Import image presets"]').selectFile(
                {
                    contents: Cypress.Buffer.from(text),
                    fileName: 'laser-image-presets.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        });
        cy.get('[aria-label="Image preset"] option').should('have.length', 2);
        cy.screenshot('laser-image-presets', { capture: 'viewport' });
        cy.contains('summary', 'Image presets').click();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions).to.include({
                imageMode: 'halftone',
                halftoneCellSize: 2,
                halftoneAngle: 30,
            });
            const powers = p.stack[0].toolpath.laserPaths.flatMap((p) =>
                p.points.map((v) => v.power),
            );
            expect(powers.every((v) => v === 0 || v === 250)).to.equal(true);
            expect(powers.some((v) => v === 250)).to.equal(true);
        });
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Drag to orbit', { timeout: 30000 }).should('be.visible');
        // gViewer reports loaded before its configured 250 ms focus animation ends.
        cy.wait(350, { log: false });
        cy.screenshot('laser-halftone-output', { capture: 'viewport' });
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.contains('label', /^Image mode/)
            .find('select')
            .select('edge');
        cy.get('[aria-label="Edge strength"]').type('{selectall}1.5').blur();
        cy.contains('button', /^Save Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let edgeCode;
        cy.readDownload('.gcode').then((code) => {
            edgeCode = code;
            expect(code).to.include('S250');
            expect(code).to.include('S0');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions).to.include({
                imageMode: 'edge',
                edgeGain: 1.5,
            });
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions?.imageMode ===
                        'edge' &&
                    saved.snapshot.stack[0].args.laserOptions.edgeGain === 1.5
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Edge mode was not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.get('[aria-label="Edge strength"]').should('have.value', '1.5');
        cy.contains('button', 'Cancel Edit').click();
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.equal(edgeCode);
            cy.window().then(async (win) => {
                const { prepareGcodePreview } = await win.eval(
                    "import('/src/engine/prepare-gcode-preview.ts')",
                );
                const packed = await prepareGcodePreview(code, () => {}, {
                    laser: true,
                    laserMax: 1000,
                });
                expect(packed.totalVertices).to.be.greaterThan(0);
                expect(
                    packed.chunks.some((chunk) =>
                        new Float32Array(chunk.power).some((v) => v > 0),
                    ),
                ).to.equal(true);
            });
        });
        cy.get('[aria-label="Simulation"]').click();
        cy.get('pre').should('contain.text', 'S250');
        cy.contains('Drag to orbit', { timeout: 30000 }).should('be.visible');
        cy.wait(350, { log: false });
        cy.screenshot('laser-edge-output', { capture: 'viewport' });
    });
});
