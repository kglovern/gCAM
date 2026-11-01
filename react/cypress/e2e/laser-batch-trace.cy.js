const png = (win, draw) => {
    const canvas = win.document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 100, 60);
    draw(ctx);
    return Cypress.Buffer.from(
        canvas.toDataURL('image/png').split(',')[1],
        'base64',
    );
};
describe('Multi-file image trace to SVG', () => {
    it('keeps the drawing intact, continues after a bad file and saves uniquely named physical SVGs', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        let before;
        cy.snapshot().then((p) => {
            before = p;
        });
        cy.menu('File', 'Trace images to SVG…');
        cy.window().then(async (win) => {
            const bytes = png(win, (ctx) => {
                ctx.fillStyle = 'black';
                ctx.fillRect(10, 10, 80, 40);
                ctx.fillStyle = 'white';
                ctx.fillRect(30, 20, 40, 20);
            });
            const { pngCrc } = await win.eval(
                "import('/src/lib/pngMetadata.ts')",
            );
            const chunk = new win.Uint8Array(21),
                view = new win.DataView(chunk.buffer);
            view.setUint32(0, 9);
            chunk.set([112, 72, 89, 115], 4);
            view.setUint32(8, 10000);
            view.setUint32(12, 10000);
            chunk[16] = 1;
            view.setUint32(17, pngCrc(chunk.subarray(4, 17)));
            const physical = Cypress.Buffer.concat([
                bytes.subarray(0, 33),
                Cypress.Buffer.from(chunk),
                bytes.subarray(33),
            ]);
            cy.get('input[aria-label="Images to trace"]').selectFile(
                [
                    {
                        contents: bytes,
                        fileName: 'art.png',
                        mimeType: 'image/png',
                    },
                    {
                        contents: Cypress.Buffer.from('bad image'),
                        fileName: 'broken.png',
                        mimeType: 'image/png',
                    },
                    {
                        contents: physical,
                        fileName: 'ART.png',
                        mimeType: 'image/png',
                    },
                ],
                { force: true },
            );
        });
        cy.get('[role="status"]')
            .contains('2 of 3 ready', { timeout: 30000 })
            .should('be.visible');
        cy.contains('Could not decode image.').should('be.visible');
        cy.contains('button', /^Stop$/).should('not.exist');
        cy.screenshot('batch-image-trace', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button', /^Save all SVGs$/).click();
        cy.readDownload('art.svg').then((svg) => {
            expect(svg).to.include('width="100px"');
            expect(svg).to.include('fill-rule="evenodd"');
            expect(svg.match(/ Z/g)).to.have.length(2);
        });
        let output;
        cy.readDownload('ART (2).svg').then((svg) => {
            output = svg;
            expect(svg).to.include('width="10mm"');
            expect(svg).to.include('height="6mm"');
            expect(svg.match(/ Z/g)).to.have.length(2);
        });
        cy.snapshot().then((p) => {
            expect(p.loops).to.deep.equal(before.loops);
            expect(p.bitmaps).to.deep.equal(before.bitmaps);
            expect(p.stack).to.deep.equal(before.stack);
            expect(p.selected).to.deep.equal(before.selected);
        });
        cy.get('[aria-label="Close batch trace"]').click();
        cy.then(() =>
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(output),
                    fileName: 'traced.svg',
                    mimeType: 'image/svg+xml',
                },
                { force: true },
            ),
        );
        cy.contains('traced.svg:').should('contain.text', '2 shapes');
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(2);
            const points = p.loops.flatMap((loop) => loop.points);
            expect(Math.min(...points.map((point) => point.x))).to.be.closeTo(
                1,
                0.05,
            );
            expect(Math.max(...points.map((point) => point.x))).to.be.closeTo(
                9,
                0.05,
            );
        });
    });
    it('saves open center-line strokes as SVG without closing them', () => {
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.menu('File', 'Trace images to SVG…');
        cy.get('[aria-label="Batch trace mode"]').select('centerline');
        cy.window().then((win) => {
            const bytes = png(win, (ctx) => {
                ctx.fillStyle = 'black';
                ctx.fillRect(47, 10, 5, 40);
                ctx.fillRect(20, 27, 60, 5);
            });
            cy.get('input[aria-label="Images to trace"]').selectFile(
                {
                    contents: bytes,
                    fileName: 'cross.png',
                    mimeType: 'image/png',
                },
                { force: true },
            );
        });
        cy.get('[aria-label="Save cross.svg"]', { timeout: 30000 }).click();
        cy.readDownload('cross.svg').then((svg) => {
            expect(svg).to.include('fill="none"');
            expect(svg).to.include('stroke="black"');
            expect(svg.match(/M/g)).to.have.length(4);
            expect(svg).not.to.include(' Z');
        });
    });
});
