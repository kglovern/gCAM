describe('Processed laser bitmap export', () => {
    it('exports cropped full-resolution pixels and physical size without creating a toolpath', () => {
        cy.viewport(1280, 900);
        let savedPng;
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-image-modes.png');
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1200').blur();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('label', 'Resolution (DPI)')
            .find('input')
            .type('{selectall}254')
            .blur();
        cy.contains('label', 'Image mode').find('select').select('threshold');
        cy.get('[aria-label="Crop left percent"]').type('{selectall}25').blur();
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}75')
            .blur();
        cy.snapshot().then((p) => expect(p.stack).to.have.length(0));
        cy.task('clearDownloads');
        cy.contains('button', 'Save processed PNG').click();
        cy.readFile('cypress/downloads/processed-laser-image.png', 'base64', {
            timeout: 30000,
        }).then((base64) => {
            savedPng = base64;
            const bytes = Cypress.Buffer.from(base64, 'base64');
            expect(Array.from(bytes.subarray(0, 8))).to.deep.equal([
                137, 80, 78, 71, 13, 10, 26, 10,
            ]);
            expect(bytes.readUInt32BE(16)).to.equal(400);
            expect(bytes.readUInt32BE(20)).to.equal(400);
            const phys = bytes.indexOf(Cypress.Buffer.from('pHYs'));
            expect(phys).to.be.greaterThan(0);
            expect(bytes.readUInt32BE(phys + 4)).to.equal(10000);
            expect(bytes.readUInt32BE(phys + 8)).to.equal(10000);
            cy.window().then(async (win) => {
                const image = new win.Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const canvas = win.document.createElement('canvas');
                canvas.width = canvas.height = 400;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const pixels = ctx.getImageData(0, 0, 400, 400).data;
                let invalid = 0;
                for (let i = 0; i < pixels.length; i += 4)
                    if (
                        (pixels[i] !== 0 && pixels[i] !== 255) ||
                        pixels[i + 1] !== pixels[i] ||
                        pixels[i + 2] !== pixels[i] ||
                        pixels[i + 3] !== 255
                    )
                        invalid++;
                expect(invalid).to.equal(0);
                expect(pixels[0]).to.equal(0);
                expect(pixels[399 * 4]).to.equal(255);
            });
        });
        cy.contains('button', 'Save processed PNG')
            .should('be.enabled')
            .scrollIntoView();
        cy.screenshot('laser-processed-image-export', { capture: 'viewport' });
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.then(() =>
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(savedPng, 'base64'),
                    fileName: 'processed.png',
                    mimeType: 'image/png',
                },
                { force: true },
            ),
        );
        cy.contains('Embedded size: 40mm × 40mm').should('be.visible');
        cy.screenshot('laser-png-embedded-size', { capture: 'viewport' });
        cy.contains('button', 'Engrave image').click();
        cy.contains('label', 'Pixel pass-through').find('input').check();
        cy.contains('label', 'Resolution (DPI)')
            .find('input')
            .should('be.disabled')
            .and('have.value', '254');
        cy.snapshot().then((p) => {
            expect(p.bitmaps[0].w).to.be.closeTo(40, 1e-9);
            expect(p.bitmaps[0].h).to.be.closeTo(40, 1e-9);
        });
        cy.freshProject({ tools: false });
        cy.then(() =>
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(savedPng, 'base64'),
                    fileName: 'processed.png',
                    mimeType: 'image/png',
                },
                { force: true },
            ),
        );
        cy.contains('button', 'Use as bitmap').should('be.visible');
        cy.contains('Embedded size:').should('not.exist');
        cy.contains('button', 'Use as bitmap').click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps[0].w).to.be.closeTo(80, 1e-9);
            expect(p.bitmaps[0].h).to.be.closeTo(80, 1e-9);
        });
    });
});
