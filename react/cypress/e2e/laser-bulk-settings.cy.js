describe('Atomic laser image settings', () => {
    it('rebuilds selected raster power and passes while preserving individual crops and one-step history', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.contains(/Bitmap .+ placed/).should('exist');
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('label', /^Resolution \(DPI\)$/)
            .find('input[type="number"]')
            .type('{selectall}127')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]').type(
            '{selectall}Full image{enter}',
        );
        cy.get('[aria-label="Duplicate Full image"]').click();
        cy.get('[aria-label="Name Full image copy"]').type(
            '{selectall}Cropped image{enter}',
        );
        cy.get('[aria-label="Edit Cropped image"]').click();
        cy.get('[aria-label="Crop left percent"]').type('{selectall}25').blur();
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}75')
            .blur();
        cy.contains('button', /^Save Toolpath$/).click();
        cy.get('[aria-label="Select laser operations"]').click();
        cy.get('[aria-label="Select all laser operations"]').check();
        cy.contains('summary', 'Edit selected settings').click();
        cy.get('[aria-label="Apply selected speed"]').check();
        cy.get('[aria-label="Selected laser speed"]')
            .type('{selectall}900')
            .blur();
        cy.get('[aria-label="Apply selected power"]').check();
        cy.get('[aria-label="Selected laser power"]')
            .type('{selectall}10')
            .blur();
        cy.get('[aria-label="Apply selected passes"]').check();
        cy.get('[aria-label="Selected laser passes"]')
            .type('{selectall}2')
            .blur();
        cy.contains('button', 'Apply to selected').click();
        cy.contains('2 operations updated.', { timeout: 30000 }).should(
            'be.visible',
        );
        const verify = (p) => {
            expect(p.stack).to.have.length(2);
            for (const entry of p.stack) {
                expect(entry.args).to.include({
                    laserFeed: 900,
                    laserSMax: 100,
                    laserPower: 100,
                });
                expect(entry.args.laserOptions.passes).to.equal(2);
                const powers = entry.toolpath.laserPaths.flatMap((path) =>
                    path.points.map((p) => p.power),
                );
                expect(powers.every((p) => p >= 0 && p <= 100)).to.equal(true);
                expect(powers.some((p) => p === 100)).to.equal(true);
            }
            expect(
                p.stack[0].args.laserOptions.imageCrop ?? {
                    left: 0,
                    bottom: 0,
                    right: 1,
                    top: 1,
                },
            ).to.deep.equal({
                left: 0,
                bottom: 0,
                right: 1,
                top: 1,
            });
            expect(p.stack[1].args.laserOptions.imageCrop).to.deep.equal({
                left: 0.25,
                bottom: 0,
                right: 0.75,
                top: 1,
            });
        };
        cy.snapshot().then(verify);
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(p.stack.every((e) => e.args.laserSMax === 400)).to.equal(
                true,
            ),
        );
        cy.get('[aria-label="Redo"]').click();
        cy.snapshot().then(verify);
        cy.get('[aria-label="Selected laser operations"]').scrollIntoView();
        cy.screenshot('laser-bulk-image-settings', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S100');
            expect(code).to.include('F900');
            expect(code).not.to.include('S400');
            expect(code.match(/Laser pass 2/g)).to.have.length(2);
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack.length === 2 &&
                    saved.snapshot.stack.every((e) => e.args.laserSMax === 100)
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Bulk image settings were not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then(verify);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
