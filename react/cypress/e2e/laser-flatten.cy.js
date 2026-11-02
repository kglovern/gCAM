const dialog = '[role="dialog"][aria-label="Flatten image region"]';
const ready = () =>
    cy
        .get(dialog)
        .contains('button', 'Replace with flattened image', { timeout: 30000 })
        .should('be.enabled');
const powered = (toolpath) =>
    toolpath.laserPaths.flatMap(({ points }) =>
        points
            .slice(1)
            .flatMap((p, i) =>
                p.power > 0
                    ? [
                          [points[i], p].map((v) => [
                              v.x.toFixed(5),
                              v.y.toFixed(5),
                          ]),
                          p.power.toFixed(8),
                      ]
                    : [],
            ),
    );
const inside = (mask, x, y) => {
    let hit = false;
    for (const poly of mask)
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i],
                b = poly[j];
            if (
                a.y > y !== b.y > y &&
                x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
            )
                hit = !hit;
        }
    return hit;
};
const pixels = async (win, url) => {
    const img = new win.Image();
    img.src = url;
    await img.decode();
    const c = win.document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return {
        width: c.width,
        height: c.height,
        data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data),
    };
};
it('bakes native colour/alpha with crop and holes, preserves placement, supports Cancel/Undo/Redo and regenerates equal native laser output', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false, multipleSelection: false });
    cy.get('[aria-label="Laser"]').click();
    cy.window().then((win) => {
        const c = win.document.createElement('canvas');
        c.width = c.height = 16;
        const ctx = c.getContext('2d'),
            image = ctx.createImageData(16, 16);
        for (let y = 0; y < 16; y++)
            for (let x = 0; x < 16; x++)
                image.data.set([x * 16, y * 16, 200, 255], (y * 16 + x) * 4);
        ctx.putImageData(image, 0, 0);
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    c.toDataURL('image/png').split(',')[1],
                    'base64',
                ),
                fileName: 'colour-mask.png',
                mimeType: 'image/png',
            },
            { force: true },
        );
    });
    cy.contains(/Bitmap .+ placed/).should('exist');
    cy.menu('Draw', 'Rectangle');
    cy.worldClick(30, 30);
    cy.worldClick(70, 70);
    cy.worldClick(40, 40);
    cy.worldClick(50, 50);
    cy.get('[aria-label="Select shapes"]').click();
    cy.get('[aria-label="Select layer Default"]').click();
    cy.contains('button', /^Laser Raster$/).click();
    cy.contains('button', 'Mask image to selected shapes').click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}50').blur();
    cy.contains('label', /^Pixel pass-through/)
        .find('input')
        .check();
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
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    let before, originalPixels, oldOutput, flat;
    cy.snapshot().then((p) => {
        before = p;
        const mask = p.stack[0].args.laserOptions.imageMask;
        expect(mask).to.have.length(2);
        for (const axis of ['x', 'y']) {
            expect(Math.min(...mask[1].map((v) => v[axis]))).to.be.greaterThan(
                Math.min(...mask[0].map((v) => v[axis])),
            );
            expect(Math.max(...mask[1].map((v) => v[axis]))).to.be.lessThan(
                Math.max(...mask[0].map((v) => v[axis])),
            );
        }
        oldOutput = powered(p.stack[0].toolpath);
        expect(oldOutput.length).to.be.greaterThan(0);
        cy.window().then(async (win) => {
            originalPixels = await pixels(win, p.bitmaps[0].dataUrl);
        });
    });
    cy.get('button[aria-label^="Edit Laser Raster"]').click();
    cy.contains('button', /^Flatten image region/).click();
    ready();
    cy.get(dialog).contains('button', 'Cancel').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.deep.equal(before.bitmaps);
        expect(p.stack).to.deep.equal(before.stack);
    });
    cy.contains('button', /^Flatten image region/).click();
    ready();
    cy.screenshot('laser-flatten-preview', { capture: 'viewport' });
    cy.get(dialog).contains('button', 'Replace with flattened image').click();
    cy.get('[aria-label="Crop left percent"]').should('have.value', '0');
    cy.contains('button', 'Remove mask').should('not.exist');
    cy.snapshot().then((p) => {
        flat = p;
        expect(p.stack).to.have.length(0);
        expect(p.loops).to.have.length(3);
        expect(p.bitmaps).to.have.length(1);
        expect(p.bitmaps[0].id).not.to.equal(before.bitmaps[0].id);
        expect(p.bitmaps[0]).to.include({
            x: 30,
            y: 30,
            w: 40,
            h: 40,
            rotation: 0,
        });
        expect(p.loops.filter((l) => !l.bitmapId)).to.deep.equal(
            before.loops.filter((l) => !l.bitmapId),
        );
        cy.window().then(async (win) => {
            const out = await pixels(win, p.bitmaps[0].dataUrl);
            expect([out.width, out.height]).to.deep.equal([8, 8]);
            let holes = 0;
            for (let row = 0; row < 8; row++)
                for (let col = 0; col < 8; col++) {
                    const sx = col + 4,
                        sy = row + 4,
                        at = (row * 8 + col) * 4,
                        keep = inside(
                            before.stack[0].args.laserOptions.imageMask,
                            (sx + 0.5) / 16,
                            1 - (sy + 0.5) / 16,
                        );
                    const expected = keep
                        ? originalPixels.data.slice(
                              (sy * 16 + sx) * 4,
                              (sy * 16 + sx) * 4 + 4,
                          )
                        : [0, 0, 0, 0];
                    expect(out.data.slice(at, at + 4)).to.deep.equal(expected);
                    if (!keep) holes++;
                }
            expect(holes).to.be.greaterThan(0);
        });
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.deep.equal(before.bitmaps);
        expect(p.stack).to.deep.equal(before.stack);
    });
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.deep.equal(flat.bitmaps);
        expect(p.stack).to.have.length(0);
    });
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}50').blur();
    cy.contains('label', /^Pixel pass-through/)
        .find('input')
        .check();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(powered(p.stack[0].toolpath)).to.deep.equal(oldOutput);
        expect(p.stack[0].args.laserOptions.imageMask ?? []).to.deep.equal([]);
    });
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.match(/S[1-9]/);
        expect(code).not.to.match(/M6|G[01] Z/);
    });
    let saved;
    cy.snapshot().then((p) => {
        saved = p;
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    JSON.stringify({
                        kind: 'gcam.project',
                        version: 2,
                        exportedAt: new Date().toISOString(),
                        fileName: 'Flattened colour image',
                        snapshot: saved,
                    }),
                ),
                fileName: 'flattened.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded flattened.gcam.json.').should('exist');
    cy.get('[aria-label="Laser"]').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.deep.equal(flat.bitmaps);
        expect(powered(p.stack[0].toolpath)).to.deep.equal(oldOutput);
    });
});
