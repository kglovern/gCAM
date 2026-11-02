describe('Pixel-native laser engraving', () => {
    it('preserves source pixels, exports at native DPI and survives reload', () => {
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
        cy.get('[aria-label="Image mode"]').select('jarvis');
        cy.contains('label', /^Brightness$/)
            .find('input')
            .type('{selectall}0.5')
            .blur();
        cy.contains('label', /^Gamma$/)
            .find('input')
            .type('{selectall}2')
            .blur();
        cy.get('[aria-label="Invert image"]').check();
        cy.get('[aria-label="Pixel pass-through"]').check();
        cy.contains('label', /^Brightness$/)
            .find('input')
            .should('be.disabled');
        cy.get('[aria-label="Image mode"]').should('be.disabled');
        cy.contains('label', /^Gamma$/)
            .find('input')
            .should('be.disabled');
        cy.get('[aria-label="Resolution (DPI)"]')
            .should('be.disabled')
            .and('have.value', '40.64');
        cy.contains('label', 'Skip blank row ends').find('input').uncheck();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.passThrough).to.equal(true);
            expect(p.stack[0].toolpath.laserSpot).to.be.closeTo(0.625, 1e-9);
            expect(p.stack[0].toolpath.laserPaths).to.have.length(64);
            const powers = new Set(
                p.stack[0].toolpath.laserPaths.flatMap((p) =>
                    p.points.map((v) => v.power),
                ),
            );
            expect(powers.size).to.be.greaterThan(20);
        });
        let code;
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((text) => {
            code = text;
            expect(text).to.include('S250');
            expect(text).not.to.match(/M6|G[01] Z/);
        });
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.task('clearDownloads');
        cy.contains('button', 'Save processed PNG').click();
        cy.readFile('cypress/downloads/processed-laser-image.png', 'base64', {
            timeout: 30000,
        }).then((base64) => {
            const bytes = Cypress.Buffer.from(base64, 'base64');
            expect(bytes.readUInt32BE(16)).to.equal(128);
            expect(bytes.readUInt32BE(20)).to.equal(64);
            const phys = bytes.indexOf(Cypress.Buffer.from('pHYs'));
            expect(bytes.readUInt32BE(phys + 4)).to.equal(1600);
            expect(bytes.readUInt32BE(phys + 8)).to.equal(1600);
            cy.fixture('laser-image-modes.png', 'base64').then((original) =>
                cy.window().then(async (win) => {
                    const pixels = async (source) => {
                        const image = new win.Image();
                        image.src = `data:image/png;base64,${source}`;
                        await image.decode();
                        const canvas = win.document.createElement('canvas');
                        canvas.width = 128;
                        canvas.height = 64;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(image, 0, 0);
                        return ctx.getImageData(0, 0, 128, 64).data;
                    };
                    const [a, b] = await Promise.all([
                        pixels(original),
                        pixels(base64),
                    ]);
                    expect(Array.from(b)).to.deep.equal(Array.from(a));
                }),
            );
        });
        cy.contains('label', 'Pixel pass-through').scrollIntoView();
        cy.screenshot('laser-pixel-pass-through', { capture: 'viewport' });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (saved?.snapshot.stack[0]?.args.laserOptions?.passThrough)
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Pass-through operation was not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.get('[aria-label="Pixel pass-through"]').should('be.checked');
        cy.contains('label', /^Brightness$/)
            .find('input')
            .should('be.disabled')
            .and('have.value', '0.5');
        cy.contains('button', 'Cancel Edit').click();
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((text) => expect(text).to.equal(code));
    });
});
