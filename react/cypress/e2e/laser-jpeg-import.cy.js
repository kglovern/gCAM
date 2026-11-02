import { exifSegment } from '../../src/lib/fixtures/jpegMetadata.js';
function jpeg(win, orientation) {
    const canvas = win.document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect((i % 2) * 200, Math.floor(i / 2) * 50, 200, 50);
    });
    const raw = Cypress.Buffer.from(
        canvas.toDataURL('image/jpeg', 1).split(',')[1],
        'base64',
    );
    return Cypress.Buffer.concat([
        raw.subarray(0, 2),
        Cypress.Buffer.from(exifSegment({ orientation })),
        raw.subarray(2),
    ]);
}
describe('JPEG physical dimensions and orientation', () => {
    it('uses browser-oriented pixels once, imports EXIF size and retains native engraving after reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        let contents;
        cy.window().then(async (win) => {
            const { loadBitmapFile, imageDataOf } = await win.eval(
                "import('/src/lib/bitmap.ts')",
            );
            const colors = [
                [255, 0, 0],
                [0, 255, 0],
                [0, 0, 255],
                [255, 255, 0],
            ];
            const expected = [
                [0, 1, 2, 3],
                [1, 0, 3, 2],
                [3, 2, 1, 0],
                [2, 3, 0, 1],
                [0, 2, 1, 3],
                [2, 0, 3, 1],
                [3, 1, 2, 0],
                [1, 3, 0, 2],
            ];
            for (let orientation = 1; orientation <= 8; orientation++) {
                const bytes = jpeg(win, orientation),
                    file = new win.File(
                        [bytes],
                        `orientation-${orientation}.jpg`,
                        { type: 'image/jpeg' },
                    );
                const decoded = await loadBitmapFile(file, true),
                    rotated = orientation >= 5;
                expect(decoded.pixelW).to.equal(rotated ? 100 : 400);
                expect(decoded.pixelH).to.equal(rotated ? 400 : 100);
                expect(decoded.physicalSize).to.deep.equal(
                    rotated ? { wMm: 20, hMm: 40 } : { wMm: 40, hMm: 20 },
                );
                const img = await new Promise((resolve, reject) => {
                    const image = new win.Image();
                    image.onload = () => resolve(image);
                    image.onerror = reject;
                    image.src = decoded.dataUrl;
                });
                const pixels = imageDataOf(img);
                for (let corner = 0; corner < 4; corner++) {
                    const x = Math.floor(
                            pixels.width * (corner % 2 ? 0.75 : 0.25),
                        ),
                        y = Math.floor(
                            pixels.height * (corner < 2 ? 0.25 : 0.75),
                        );
                    const actual = [
                        ...pixels.data.slice(
                            (y * pixels.width + x) * 4,
                            (y * pixels.width + x) * 4 + 3,
                        ),
                    ];
                    actual.forEach((channel, i) =>
                        expect(channel).to.be.closeTo(
                            colors[expected[orientation - 1][corner]][i],
                            3,
                        ),
                    );
                }
                if (orientation === 6) {
                    contents = bytes;
                    expect((await loadBitmapFile(file)).physicalSize).to.equal(
                        undefined,
                    );
                }
            }
        });
        cy.get('[aria-label="Laser"]').click();
        cy.then(() =>
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents,
                    fileName: 'rotated-photo.jpg',
                    mimeType: 'image/jpeg',
                },
                { force: true },
            ),
        );
        cy.contains('Embedded size: 20mm × 40mm').should('be.visible');
        cy.screenshot('laser-jpeg-embedded-size', { capture: 'viewport' });
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.get('[aria-label="Pixel pass-through"]').check();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]').should('exist');
        const verify = (p) => {
            expect(p.bitmaps[0].w).to.be.closeTo(20, 0.000001);
            expect(p.bitmaps[0].h).to.be.closeTo(40, 0.000001);
            expect(p.stack[0].args.laserOptions.passThrough).to.equal(true);
            expect(p.stack[0].toolpath.laserSpot).to.be.closeTo(0.1, 0.000001);
            expect(p.stack[0].toolpath.laserPaths).to.have.length(400);
        };
        cy.snapshot().then(verify);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S');
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (saved?.snapshot.stack[0]?.args.laserOptions?.passThrough)
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('JPEG job did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then(verify);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
