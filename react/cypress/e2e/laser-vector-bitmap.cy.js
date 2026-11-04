const rect = (id, x, y, w, h) => ({
    id,
    points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
    ].map(([x, y]) => ({ x, y })),
});
const shapes = [
    rect('outer', 100, 100, 40, 40),
    rect('hole', 110, 110, 10, 10),
    rect('overlap', 130, 120, 30, 20),
];
function importSnapshot(snapshot) {
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    fileName: 'Bitmap conversion',
                    snapshot,
                }),
            ),
            fileName: 'conversion.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
}
const base = () => ({
    loops: shapes,
    selected: shapes.map((s) => s.id),
    bitmaps: [],
    hidden: [],
    stack: [],
    guides: [],
    fileName: 'Bitmap conversion',
    stock: {
        widthMm: 300,
        heightMm: 300,
        thicknessMm: 3,
        material: 'sheet-goods',
        laserMaterial: 'plywood',
        origin: 'front-left',
    },
});
describe('Selected artwork to bitmap', () => {
    it('renders real worker pixels with filled holes, unioned overlaps, open strokes and matching fallback', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.window().then(async (win) => {
            const { vectorBitmapInWorker } = await win.eval(
                "import('/src/engine/cam-worker-client.ts')",
            );
            const { prepareVectorBitmap, paintVectorBitmap } = await win.eval(
                "import('/src/lib/vector-bitmap.ts')",
            );
            const request = {
                shapes,
                fillIds: [],
                render: 'fill',
                dpi: 127,
                lineWidth: 0.2,
            };
            const result = await vectorBitmapInWorker(request).promise;
            expect(result.png).to.be.instanceOf(win.ArrayBuffer);
            const blob = new win.Blob([result.png], { type: 'image/png' });
            const img = await win.createImageBitmap(blob);
            const canvas = win.document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            img.close();
            const pixel = (x, y) =>
                Array.from(
                    ctx.getImageData(
                        Math.floor((x - 100) * 5),
                        Math.floor((140 - y) * 5),
                        1,
                        1,
                    ).data,
                );
            expect(pixel(105, 105)).to.deep.equal([128, 128, 128, 255]);
            expect(pixel(115, 115)).to.deep.equal([255, 255, 255, 255]);
            expect(pixel(135, 125)).to.deep.equal([128, 128, 128, 255]);
            expect(pixel(150, 125)).to.deep.equal([128, 128, 128, 255]);
            expect(pixel(150, 110)).to.deep.equal([255, 255, 255, 255]);
            const original = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            ).data;
            ctx.resetTransform();
            paintVectorBitmap(
                ctx,
                prepareVectorBitmap(win.JSON.parse(JSON.stringify(request))),
            );
            const fallback = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            ).data;
            const differences = [];
            let maxDifference = 0,
                mismatchBytes = 0;
            for (let i = 0; i < original.length; i++) {
                if (original[i] !== fallback[i]) {
                    mismatchBytes++;
                    maxDifference = Math.max(
                        maxDifference,
                        Math.abs(original[i] - fallback[i]),
                    );
                    if (differences.length < 8)
                        differences.push({
                            i,
                            worker: original[i],
                            fallback: fallback[i],
                        });
                }
            }
            expect({ mismatchBytes, maxDifference, differences }).to.deep.equal(
                { mismatchBytes: 0, maxDifference: 0, differences: [] },
            );
            const outline = await vectorBitmapInWorker({
                ...request,
                shapes: [
                    {
                        id: 'open',
                        points: [
                            { x: 0, y: 0 },
                            { x: 20, y: 0 },
                        ],
                    },
                ],
                render: 'outline',
                lineWidth: 1,
            }).promise;
            expect(outline.plan.widthMm).to.equal(21);
            expect(outline.plan.heightMm).to.equal(1);
            // Physical PNG metadata is checked again through the normal bitmap importer.
            const { loadBitmapFile } = await win.eval(
                "import('/src/lib/bitmap.ts')",
            );
            const loaded = await loadBitmapFile(
                new win.File([blob], 'converted.png', { type: 'image/png' }),
                true,
            );
            expect(loaded.physicalSize.wMm).to.be.closeTo(60, 0.01);
            expect(loaded.physicalSize.hMm).to.be.closeTo(40, 0.01);
        });
    });
    it('previews, keeps/replaces source, supports undo/reload and exports the converted raster', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        importSnapshot(base());
        cy.menu('Edit', 'Convert to bitmap…');
        cy.get('[aria-label="Bitmap render"]').select('fill');
        cy.get('[aria-label="Bitmap DPI"]').type('{selectall}100').blur();
        cy.get('img[alt="Bitmap preview"]', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('label', 'Keep original shapes').find('input').check();
        cy.screenshot('laser-convert-to-bitmap', { capture: 'viewport' });
        cy.contains('button', /^Convert$/).click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(4);
            expect(p.bitmaps).to.have.length(1);
            expect(p.bitmaps[0].w).to.equal(60);
            expect(p.bitmaps[0].h).to.equal(40);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(3);
            expect(p.bitmaps).to.have.length(0);
        });
        cy.menu('Edit', 'Convert to bitmap…');
        cy.get('[aria-label="Bitmap render"]').select('fill');
        cy.get('[aria-label="Bitmap DPI"]').type('{selectall}100').blur();
        cy.get('img[alt="Bitmap preview"]', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('button', /^Convert$/).click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(1);
            expect(p.bitmaps).to.have.length(1);
            importSnapshot(p);
        });
        cy.get('button[aria-label="Edit"]').click();
        cy.contains('[role="menuitem"]', 'Trace into shapes…').should(
            'be.enabled',
        );
        cy.get('button[aria-label="Edit"]').click();
        cy.contains('button', /^Laser Raster$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}30')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.match(/S[1-9]/);
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
    it('rejects filling open paths and cancels without altering the document', () => {
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        const snapshot = base();
        snapshot.loops = [
            {
                id: 'open',
                points: [
                    { x: 100, y: 100 },
                    { x: 140, y: 120 },
                ],
            },
        ];
        snapshot.selected = ['open'];
        importSnapshot(snapshot);
        cy.menu('Edit', 'Convert to bitmap…');
        cy.get('[aria-label="Bitmap render"]').select('fill');
        cy.contains('[role="alert"]', 'Fill requires closed shapes').should(
            'be.visible',
        );
        cy.contains('button', /^Convert$/).should('be.disabled');
        cy.contains('button', /^Cancel$/).click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.deep.equal(snapshot.loops);
            expect(p.bitmaps).to.have.length(0);
        });
    });
    it('uses fill operations and replaces only source toolpaths in one undo step', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        let original;
        cy.window()
            .then(async (win) => {
                const { buildToolpathGcodeAsync } = await win.eval(
                        "import('/src/lib/engine.ts')",
                    ),
                    { previewFor } = await win.eval(
                        "import('/src/toolpaths/useToolpathStack.ts')",
                    );
                const loops = [
                    rect('a', 100, 100, 20, 20),
                    rect('b', 130, 100, 20, 20),
                    rect('c', 170, 100, 20, 20),
                ];
                const stack = [];
                for (let i = 0; i < 3; i++) {
                    const args = {
                        loops: [loops[i]],
                        operation: i === 0 ? 'laser-fill' : 'laser-cut',
                        toolDiameter: 0.1,
                        cutDepth: 1,
                        laserFeed: 1000,
                        laserPower: 200,
                        laserSpot: 0.1,
                    };
                    const result = await buildToolpathGcodeAsync(args);
                    stack.push({
                        id: 'job-' + i,
                        label: result.label,
                        args,
                        // Match the preview the app commits; project loads rebuild it this way.
                        preview: previewFor(result),
                        toolpath: { ...result.toolpath, id: 'job-' + i },
                    });
                }
                original = { ...base(), loops, stack, selected: ['a', 'b'] };
            })
            .then(() => importSnapshot(original));
        cy.menu('Edit', 'Convert to bitmap…');
        cy.get('[aria-label="Bitmap render"]').select('operations');
        cy.get('[aria-label="Bitmap DPI"]').type('{selectall}127').blur();
        cy.get('img[alt="Bitmap preview"]', { timeout: 30000 })
            .should('be.visible')
            .then(($img) => {
                const image = $img[0],
                    canvas = image.ownerDocument.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                expect(ctx.getImageData(50, 50, 1, 1).data[0]).to.equal(128);
                expect(ctx.getImageData(200, 50, 1, 1).data[0]).to.equal(255);
            });
        cy.contains('button', /^Convert$/).click();
        cy.snapshot().then((p) => {
            expect(p.stack).to.deep.equal([original.stack[2]]);
            expect(p.loops.map((s) => s.id)).to.include('c');
            expect(p.loops).to.have.length(2);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.deep.equal(original.loops);
            expect(p.stack).to.deep.equal(original.stack);
            expect(p.bitmaps).to.have.length(0);
        });
    });
});
