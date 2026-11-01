describe('Worker-backed laser bitmap tracing', () => {
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
        cy.get('[aria-label="Trace bitmap"]', { timeout: 30000 })
            .should('be.visible')
            .click();
        cy.contains('0 shapes found', { timeout: 30000 }).should('exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Import/)
            .should('be.disabled');
        cy.get('[aria-label="Trace transparency"]').check();
        cy.get('[aria-label="Trace resolution"]').select('1600');
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.get('[aria-label="Cutoff value"]').type('{selectall}1').blur();
        cy.contains('0 shapes found', { timeout: 30000 }).should('exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Import/)
            .should('be.disabled');
        cy.get('[aria-label="Cutoff value"]').type('{selectall}0').blur();
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.contains('label', 'Delete source image').find('input').uncheck();
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/)
            .click();
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(1);
            expect(p.loops).to.have.length(2);
            expect(p.selected).to.have.length(1);
            expect(p.selected[0]).not.to.equal('bitmap-loop');
        });
        cy.get('[aria-label="Undo"]').click();

        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(1);
            expect(p.loops).to.have.length(1);
            expect(p.bitmaps[0].rotation).to.equal(90);
        });
        cy.get('[aria-label="Trace bitmap"]').click();
        cy.get('[aria-label="Trace transparency"]').check();
        cy.get('[aria-label="Trace resolution"]').select('0');
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.get('[aria-label="Smoothness value"]').clear().type('0').blur();
        cy.get('[aria-label="Optimize value"]').clear().type('0').blur();
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.contains('label', 'Delete source image')
            .find('input')
            .should('be.checked');
        cy.screenshot('laser-transparency-trace', { capture: 'viewport' });
        cy.get('[aria-label="Traced shape preview"]').should(
            'have.attr',
            'width',
            '560',
        );
        cy.get('[role="dialog"]')
            .contains('button', /^Import \(1\)/)
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
