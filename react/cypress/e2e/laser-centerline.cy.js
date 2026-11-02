describe('Laser center-line tracing', () => {
    it('keeps open branches and a closed loop through preview, import, history and G-code', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false, multipleSelection: false });
        cy.get('[aria-label="Laser"]').click();
        cy.window().then((win) => {
            const canvas = win.document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 70;
            const context = canvas.getContext('2d');
            context.fillStyle = 'white';
            context.fillRect(0, 0, 100, 70);
            context.fillStyle = 'black';
            context.fillRect(27, 10, 5, 50);
            context.fillRect(10, 32, 40, 5);
            context.strokeStyle = 'black';
            context.lineWidth = 5;
            context.beginPath();
            context.arc(78, 35, 15, 0, Math.PI * 2);
            context.stroke();
            const points = [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 200, y: 170 },
                { x: 100, y: 170 },
                { x: 100, y: 100 },
            ];
            const snapshot = {
                loops: [{ id: 'image-loop', bitmapId: 'line-art', points }],
                bitmaps: [
                    {
                        id: 'line-art',
                        x: 100,
                        y: 100,
                        w: 100,
                        h: 70,
                        dataUrl: canvas.toDataURL('image/png'),
                    },
                ],
                selected: ['image-loop'],
                hidden: [],
                stack: [],
                guides: [],
                fileName: 'Center-line art',
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
                    fileName: 'centerline.gcam.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        });
        cy.menu('Edit', 'Trace into shapes…');
        cy.get('[aria-label="Trace mode"]').select('centerline');
        cy.get('[aria-label="Close trace bitmap"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(1);
            expect(p.bitmaps).to.have.length(1);
        });
        cy.menu('Edit', 'Trace into shapes…');
        cy.get('[aria-label="Trace mode"]').select('centerline');
        cy.get('[aria-label="Smoothness value"]').should('not.exist');
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(5\)/, { timeout: 30000 })
            .should('be.enabled');
        cy.contains('label', 'Delete source image').should('not.exist');
        cy.screenshot('laser-centerline-trace', { capture: 'viewport' });
        cy.get('[role="dialog"]')
            .contains('button', /^Replace bitmap \(5\)/)
            .click();
        const closed = (points) =>
            Math.hypot(
                points[0].x - points[points.length - 1].x,
                points[0].y - points[points.length - 1].y,
            ) < 0.00001;
        const length = (paths) =>
            paths.reduce(
                (n, path) =>
                    n +
                    path.points
                        .slice(1)
                        .reduce(
                            (sum, point, i) =>
                                sum +
                                Math.hypot(
                                    point.x - path.points[i].x,
                                    point.y - path.points[i].y,
                                ),
                            0,
                        ),
                0,
            );
        let traceLength, originalTraces;
        cy.snapshot().then((p) => {
            const traces = p.loops.filter((loop) => !loop.bitmapId);
            expect(traces).to.have.length(5);
            expect(traces.filter((loop) => closed(loop.points))).to.have.length(
                1,
            );
            expect(p.selected).to.have.length(5);
            expect(new Set(traces.map((loop) => loop.groupId)).size).to.equal(
                1,
            );
            expect(traces[0].groupId).to.be.a('string');
            expect(p.bitmaps).to.have.length(0);
            traceLength = length(traces);
            originalTraces = traces;
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(1));
        cy.get('[aria-label="Redo"]').click();
        cy.worldClick(205, 175);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(0));
        cy.worldClick(129.5, 150);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(5));
        cy.get('body').type('{rightarrow}');
        cy.snapshot().then((p) => {
            for (const prior of originalTraces) {
                const moved = p.loops.find((loop) => loop.id === prior.id);
                expect(moved.points[0].x).to.be.closeTo(
                    prior.points[0].x + 1,
                    0.00001,
                );
                expect(moved.points[0].y).to.equal(prior.points[0].y);
            }
            expect(p.bitmaps).to.have.length(0);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-trace-group-selection', { capture: 'viewport' });
        cy.menu('Group', 'Ungroup');
        cy.worldClick(205, 175);
        cy.worldClick(129.5, 150);
        cy.snapshot().then((p) => {
            expect(p.selected).to.have.length(1);
            expect(
                p.loops
                    .filter((loop) => !loop.bitmapId)
                    .every((loop) => !loop.groupId),
            ).to.equal(true);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.worldClick(205, 175);
        cy.worldClick(129.5, 150);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(5));
        cy.contains('button', /^Laser Cut$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack[0].toolpath.laserPaths).to.have.length(5);
            expect(length(p.stack[0].toolpath.laserPaths)).to.be.closeTo(
                traceLength,
                0.00001,
            );
            expect(
                p.stack[0].toolpath.laserPaths.filter((path) =>
                    closed(path.points),
                ),
            ).to.have.length(1);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S250');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
});
