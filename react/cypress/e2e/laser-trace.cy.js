describe('Worker-backed laser bitmap tracing', () => {
    it('keeps adjustable tracing on bitmap import without a separate File conversion command', () => {
        cy.freshProject({ tools: false });
        cy.get('button[aria-label="File"]').click();
        cy.contains('[role="menuitem"]', /Trace images to SVG/i).should(
            'not.exist',
        );
        cy.get('button[aria-label="File"]').click();
        cy.get('button[aria-label="Edit"]').click();
        cy.contains('[role="menuitem"]', 'Trace into shapes…').should(
            'be.disabled',
        );
        cy.get('button[aria-label="Edit"]').click();
        cy.importDesign('contrast.png');
        cy.contains('How should this bitmap be used?').should('not.exist');
        cy.snapshot().then((project) => {
            const bitmap = project.bitmaps[0];
            cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
                const camera = JSON.parse($canvas.attr('data-camera'));
                const rect = $canvas[0].getBoundingClientRect();
                cy.wrap($canvas).trigger('contextmenu', {
                    clientX:
                        rect.left +
                        camera.tx +
                        (bitmap.x + bitmap.w / 2) * camera.scale,
                    clientY:
                        rect.top +
                        camera.ty -
                        (bitmap.y + bitmap.h / 2) * camera.scale,
                });
            });
        });
        cy.get('[role="menu"][aria-label="Item actions"]')
            .contains('button', 'Trace into shapes…')
            .click();
        cy.get('[aria-label="Trace resolution"]').should('be.visible');
        cy.get('[aria-label="Close trace bitmap"]').click();
        cy.snapshot().then((project) =>
            expect(project.bitmaps).to.have.length(1),
        );

        cy.menu('Draw', 'Rectangle');
        cy.worldClick(30, 30);
        cy.worldClick(60, 60);
        cy.get('[aria-label="Select shapes"]').click();
        cy.get('[aria-label="Select layer Default"]').click();
        cy.get('button[aria-label="Edit"]').click();
        cy.contains('[role="menuitem"]', 'Trace into shapes…').should(
            'be.disabled',
        );
        cy.get('button[aria-label="Edit"]').click();
        cy.get('[aria-label="Undo"]').click();
        cy.menu('Edit', 'Trace into shapes…');
        cy.get('[aria-label="Trace resolution"]')
            .should('be.visible')
            .select('1600');
        cy.contains('button', /^Replace bitmap \(/, { timeout: 30000 })
            .should('be.enabled')
            .click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(0);
            expect(p.loops.length).to.be.greaterThan(0);
            expect(p.selected).to.have.length(p.loops.length);
        });
    });
    it('traces a rotated transparent image, preserves cancel/undo and exports matching geometry', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.window().then((win) => {
            const canvas = win.document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 40;
            const context = canvas.getContext('2d');
            context.fillStyle = 'white';
            context.fillRect(8, 4, 24, 24);
            const snapshot = {
                loops: [
                    {
                        id: 'bitmap-loop',
                        bitmapId: 'trace-image',
                        points: [
                            { x: 175, y: 75 },
                            { x: 175, y: 175 },
                            { x: 125, y: 175 },
                            { x: 125, y: 75 },
                            { x: 175, y: 75 },
                        ],
                    },
                ],
                bitmaps: [
                    {
                        id: 'trace-image',
                        x: 100,
                        y: 100,
                        w: 100,
                        h: 50,
                        rotation: 90,
                        dataUrl: canvas.toDataURL('image/png'),
                    },
                ],
                selected: ['bitmap-loop'],
                hidden: [],
                stack: [],
                guides: [],
                fileName: 'Rotated transparency trace',
                stock: {
                    widthMm: 300,
                    heightMm: 300,
                    thicknessMm: 3,
                    material: 'sheet-goods',
                    laserMaterial: 'plywood',
                    origin: 'front-left',
                },
            };
            const text = JSON.stringify({
                kind: 'gcam.project',
                version: 2,
                exportedAt: new Date().toISOString(),
                fileName: snapshot.fileName,
                snapshot,
            });
            cy.get('input[aria-label="Import project file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(text),
                    fileName: 'trace.gcam.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        });
        cy.menu('Edit', 'Trace into shapes…');
        cy.contains('0 shapes found', { timeout: 30000 }).should('exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap/)
            .should('be.disabled');
        cy.get('[aria-label="Trace transparency"]').check();
        cy.get('[aria-label="Trace resolution"]').select('1600');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.get('[aria-label="Cutoff value"]').type('{selectall}1').blur();
        cy.contains('0 shapes found', { timeout: 30000 }).should('exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap/)
            .should('be.disabled');
        cy.get('[aria-label="Cutoff value"]').type('{selectall}0').blur();
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.contains('label', 'Delete source image').should('not.exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/)
            .click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(0);
            expect(p.loops).to.have.length(1);
            expect(p.selected).to.have.length(1);
            expect(p.selected[0]).not.to.equal('bitmap-loop');
        });
        cy.get('[aria-label="Undo"]').click();

        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(1);
            expect(p.loops).to.have.length(1);
            expect(p.bitmaps[0].rotation).to.equal(90);
        });
        cy.menu('Edit', 'Trace into shapes…');
        cy.get('[aria-label="Trace transparency"]').check();
        cy.get('[aria-label="Trace resolution"]').select('0');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.get('[aria-label="Smoothness value"]').clear().type('0').blur();
        cy.get('[aria-label="Optimize value"]').clear().type('0').blur();
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.contains('label', 'Delete source image').should('not.exist');
        cy.screenshot('laser-transparency-trace', { capture: 'viewport' });
        cy.get('[aria-label="Traced shape preview"]').should(
            'have.attr',
            'width',
            '560',
        );
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(1\)/)
            .click();
        const bounds = (points) => ({
            minX: Math.min(...points.map((p) => p.x)),
            maxX: Math.max(...points.map((p) => p.x)),
            minY: Math.min(...points.map((p) => p.y)),
            maxY: Math.max(...points.map((p) => p.y)),
        });
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(0);
            expect(p.loops).to.have.length(1);
            const b = bounds(p.loops[0].points);
            expect(b.minX).to.be.closeTo(130, 0.1);
            expect(b.maxX).to.be.closeTo(160, 0.1);
            expect(b.minY).to.be.closeTo(85, 0.1);
            expect(b.maxY).to.be.closeTo(115, 0.1);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(1);
            expect(p.bitmaps[0].rotation).to.equal(90);
        });
        cy.get('[aria-label="Redo"]').click();
        cy.contains('button', /^Laser Cut$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) => {
            const b = bounds(p.stack[0].toolpath.laserPaths[0].points);
            expect(b.minX).to.be.closeTo(130, 0.1);
            expect(b.maxY).to.be.closeTo(115, 0.1);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S250');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
});
