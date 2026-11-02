const poweredSegments = (toolpath) =>
    toolpath.laserPaths.flatMap(({ points }) =>
        points
            .slice(1)
            .flatMap((p, i) => (p.power > 0 ? [[points[i], p]] : [])),
    );
describe('Laser image regions', () => {
    beforeEach(() => {
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.contains(/Bitmap .+ placed/).should('exist');
    });
    it('saves a nondestructive crop and restores the whole image on reset', () => {
        cy.snapshot().then((p) =>
            cy.wrap(p.bitmaps[0].dataUrl).as('sourcePixels'),
        );
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        for (const [edge, value] of [
            ['left', 25],
            ['bottom', 25],
            ['right', 75],
            ['top', 75],
        ])
            cy.get(`[aria-label="Crop ${edge} percent"]`)
                .type(`{selectall}${value}`)
                .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            const bitmap = p.bitmaps[0],
                b = {
                    minX: bitmap.x,
                    minY: bitmap.y,
                    maxX: bitmap.x + bitmap.w,
                    maxY: bitmap.y + bitmap.h,
                };
            cy.get('@sourcePixels').should('equal', bitmap.dataUrl);
            expect(bitmap.w).to.equal(80);
            expect(p.stack[0].args.laserOptions.imageCrop).to.deep.equal({
                left: 0.25,
                bottom: 0.25,
                right: 0.75,
                top: 0.75,
            });
            for (const line of poweredSegments(p.stack[0].toolpath))
                for (const point of line) {
                    expect(point.x).to.be.within(
                        b.minX + (b.maxX - b.minX) * 0.25 - 1e-6,
                        b.minX + (b.maxX - b.minX) * 0.75 + 1e-6,
                    );
                    expect(point.y).to.be.within(
                        b.minY + (b.maxY - b.minY) * 0.25 - 1e-6,
                        b.minY + (b.maxY - b.minY) * 0.75 + 1e-6,
                    );
                }
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions?.imageCrop
                        ?.left === 0.25
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Cropped laser operation was not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.get('[aria-label="Crop left percent"]').should('have.value', '25');
        cy.get('[aria-label="Processed laser image preview"]').should(
            ($canvas) => {
                const canvas = $canvas[0];
                const pixels = canvas
                    .getContext('2d')
                    .getImageData(0, 0, canvas.width, canvas.height).data;
                expect(
                    pixels.some(
                        (value, index) => index % 4 !== 3 && value < 100,
                    ),
                    'edited job has a real processed preview',
                ).to.equal(true);
            },
        );
        cy.contains('button', 'Reset image region').click();
        cy.get('[aria-label="Crop left percent"]').should('have.value', '0');
        cy.get('[aria-label="Crop right percent"]').should('have.value', '100');
    });
    it('uses selected closed artwork as a mask while keeping the original bitmap', () => {
        cy.menu('Draw', 'Rectangle');
        cy.worldClick(30, 30);
        cy.worldClick(70, 70);
        cy.get('[aria-label="Select shapes"]').click();
        cy.get('[aria-label="Select layer Default"]').click();
        cy.contains('button', /^Laser Raster$/).click();
        cy.contains('button', 'Mask image to selected shapes')
            .should('be.enabled')
            .click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.bitmaps).to.have.length(1);
            expect(p.loops).to.have.length(2);
            expect(p.stack[0].args.loops).to.have.length(1);
            expect(p.stack[0].args.laserOptions.imageMask).to.have.length(1);
            for (const line of poweredSegments(p.stack[0].toolpath))
                for (const point of line) {
                    expect(point.x).to.be.within(30 - 1e-6, 70 + 1e-6);
                    expect(point.y).to.be.within(30 - 1e-6, 70 + 1e-6);
                }
        });
    });
});
