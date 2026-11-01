describe('Laser CAM features', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('fills a shape with passes, saves a recommendation, reloads it and previews exported power', () => {
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('summary', 'Lens / setup').click();
        cy.get('[aria-label="Laser identity"]').type(
            'Demo laser · calibration fixture',
        );
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1200');
        cy.get('[aria-label="Laser power percent"]').type('{selectall}25');
        cy.get('[aria-label="Laser passes"]').type('{selectall}2');
        cy.get('[aria-label="Laser line interval"]').type('{selectall}1');
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Laser angle per pass"]')
            .type('{selectall}90')
            .blur();
        cy.contains('label', 'Unpowered overscan')
            .find('input')
            .should('be.checked');
        cy.get('[aria-label="Hatch overscan"]').type('{selectall}3').blur();
        cy.contains('button', 'Save as suggestion').click();
        cy.contains('Suggested laser values')
            .scrollIntoView()
            .should('be.visible');
        cy.contains('summary', 'Material library').click();
        cy.task('clearDownloads');
        cy.contains('button', 'Export library').click();
        cy.readDownload('.json').then((text) => {
            const library = JSON.parse(text);
            expect(library.format).to.equal('gcam-laser-materials');
            expect(library.recipes).to.have.length(1);
            expect(library.recipes[0].feed).to.equal(1200);
            cy.get('[aria-label="Import laser material library"]').selectFile(
                {
                    contents: Cypress.Buffer.from(text),
                    fileName: 'laser-materials.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        });
        cy.contains('0 settings imported. Existing entries kept.').should(
            'be.visible',
        );
        cy.get('[aria-label="Search laser materials"]').type(
            'no-such-material',
        );
        cy.contains('summary', 'Material library')
            .parent()
            .find('li')
            .should('have.length', 0);
        cy.get('[aria-label="Search laser materials"]').clear();
        cy.contains('summary', 'Material library')
            .parent()
            .find('li')
            .should('have.length', 1);
        cy.contains('summary', 'Material library').scrollIntoView();

        cy.contains('button', 'Rename').click();
        cy.get('[aria-label="Material recipe name"]')
            .clear()
            .type('Plywood clean fill');
        cy.contains('button', 'Save name').click();
        cy.contains('Plywood clean fill').scrollIntoView().should('be.visible');
        cy.contains('button', /^Remove$/).click();
        cy.contains('summary', 'Material library (0)')
            .scrollIntoView()
            .should('be.visible');
        cy.contains('button', 'Undo remove').click();
        cy.contains('Plywood clean fill').scrollIntoView().should('be.visible');
        cy.contains('button', 'Use settings').should('be.enabled').click();
        cy.screenshot('laser-material-library', { capture: 'viewport' });
        cy.contains('summary', 'Material library').click();

        cy.get('[aria-label="Open tool library"]').should('not.exist');
        cy.contains('summary', 'Laser options').scrollIntoView({
            offset: { top: -12, left: 0 },
        });
        cy.screenshot('laser-suggested-settings', { capture: 'viewport' });
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.passes).to.equal(2);
            expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(1);
            expect(p.stack[0].args.laserOverscan).to.equal(3);
            expect(p.stack[0].preview[0].variableLaserPower).to.equal(true);
            expect(
                p.stack[0].toolpath.laserPaths[0].points.map((p) => p.power),
            ).to.deep.equal([0, 0, 250, 0]);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.match(/G1[^\n]*S0 F1200/);
            expect(code).to.include('S250');
            expect(code.match(/Laser pass/g)).to.have.length(2);
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Drag to orbit', { timeout: 30000 }).should('be.visible');
        cy.screenshot('laser-power-simulation', { capture: 'viewport' });
        cy.get('[aria-label="Laser"]').click();
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Select layer Default"]').click();
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('Suggested laser values').should('be.visible');
        cy.contains('User settings').should('be.visible');
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Hatch overscan"]').should('have.value', '3');
        cy.contains('button', /^Add Toolpath/).should('be.enabled');
        cy.contains('label', 'Unpowered overscan').find('input').uncheck();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[1].toolpath.laserPaths[0].points).to.have.length(2);
            expect(p.stack[1].preview[0].laserPower).to.equal(0.25);
        });
    });
    it('builds a test sheet and lets users pick a result without calculating speeds', () => {
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('summary', 'Lens / setup').click();
        cy.get('[aria-label="Laser identity"]').type(
            'Calibration fixture laser',
        );
        cy.contains('button', 'Material test').click();
        cy.task('clearDownloads');
        cy.contains('button', 'Download test sheet').click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('Material test');
            expect(code).to.include('S50 F2250');
            expect(code).to.include('S200 F3750');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.screenshot('laser-material-calibration', { capture: 'viewport' });
        cy.get('[aria-label="Material test results"] button').last().click();
        cy.contains('button', 'Save as suggestion').click();
        cy.contains('Suggested laser values').should('be.visible');
        cy.contains('button', /^Add Toolpath/).should('be.enabled');
    });
    it('engraves an image with dithering and retains settings when editing', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.log('image imported');
        cy.contains('button', 'Engrave image').click();
        cy.log('bitmap placed');
        cy.contains('button', /^Laser Raster$/).should('be.visible');
        cy.contains('summary', 'Lens / setup').click();
        cy.get('[aria-label="Laser identity"]').type('Image fixture laser');
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        cy.contains('summary', 'Image processing')
            .scrollIntoView()
            .should('be.visible');
        cy.contains('label', 'Image mode')
            .find('select')
            .select('floyd-steinberg');
        cy.contains('label', 'Smoothing')
            .find('input')
            .type('{selectall}0.6')
            .blur();
        cy.contains('label', 'Sharpening')
            .find('input')
            .type('{selectall}0.4')
            .blur();
        cy.get('[aria-label="Grayscale channel"]').select('average');
        cy.get('[aria-label="Grayscale shades"]').type('{selectall}16').blur();
        cy.contains('label', 'Invert image').find('input').check();
        cy.contains('label', 'Skip blank row ends')
            .find('input')
            .uncheck()
            .check();
        cy.contains('label', 'Resolution (DPI)')
            .find('input')
            .type('{selectall}127')
            .blur();
        cy.get('[aria-label="Raster scan angle"]').type('{selectall}45').blur();
        cy.get('[aria-label="Dot-width correction"]')
            .type('{selectall}0.05')
            .blur();
        cy.get('[aria-label="Processed laser image preview"]').should(
            'be.visible',
        );
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.imageMode).to.equal(
                'floyd-steinberg',
            );
            expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
            expect(p.stack[0].args.laserOptions.scanAngle).to.equal(45);
            expect(p.stack[0].args.laserOptions.grayscale).to.equal('average');
            expect(p.stack[0].args.laserOptions.shadeCount).to.equal(16);
            expect(p.stack[0].args.laserOptions.smoothing).to.equal(0.6);
            expect(p.stack[0].args.laserOptions.sharpening).to.equal(0.4);
            expect(p.stack[0].args.laserOptions.dotWidthCorrection).to.equal(
                0.05,
            );
            expect(p.stack[0].args.laserOptions.trimBlank).to.equal(true);
            expect(p.stack[0].args.laserSpot).to.be.closeTo(0.2, 1e-9);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S500');
            expect(code).to.include('S0');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.contains('summary', 'Image processing')
            .scrollIntoView()
            .should('be.visible');
        cy.contains('label', 'Image mode')
            .find('select')
            .should('have.value', 'floyd-steinberg');
        cy.get('[aria-label="Grayscale channel"]').should(
            'have.value',
            'average',
        );
        cy.get('[aria-label="Grayscale shades"]').should('have.value', '16');
        cy.get('[aria-label="Grayscale channel"]')
            .closest('label')
            .scrollIntoView({ offset: { top: -60, left: 0 } });
        cy.screenshot('laser-image-mapping', { capture: 'viewport' });
        cy.contains('label', 'Smoothing')
            .find('input')
            .should('have.value', '0.6');
        cy.contains('label', 'Sharpening')
            .find('input')
            .should('have.value', '0.4');
        cy.get('[aria-label="Dot-width correction"]').should(
            'have.value',
            '0.05',
        );
        cy.contains('label', 'Dot-width correction').scrollIntoView({
            offset: { top: -80, left: 0 },
        });
        cy.screenshot('laser-image-filters', { capture: 'viewport' });
        cy.contains('label', 'Image mode').find('select').select('stucki');
        cy.contains('button', /^Save Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.imageMode).to.equal('stucki');
            expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
        });
    });
});
