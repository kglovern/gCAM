function openMap(transparent = false) {
    cy.window()
        .then((win) => {
            const canvas = win.document.createElement('canvas');
            canvas.width = canvas.height = 17;
            const ctx = canvas.getContext('2d');
            const pixels = ctx.createImageData(17, 17);
            for (let y = 0; y < 17; y++)
                for (let x = 0; x < 17; x++) {
                    const shade = Math.round(
                        255 *
                            (1 -
                                Math.max(Math.abs(x - 8), Math.abs(y - 8)) / 8),
                    );
                    pixels.data.set(
                        [
                            shade,
                            shade,
                            shade,
                            transparent && x === 0 && y === 0 ? 0 : 255,
                        ],
                        (y * 17 + x) * 4,
                    );
                }
            ctx.putImageData(pixels, 0, 0);
            return Cypress.Buffer.from(
                canvas.toDataURL('image/png').split(',')[1],
                'base64',
            );
        })
        .then((contents) =>
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents,
                    fileName: 'pyramid.png',
                    mimeType: 'image/png',
                },
                { force: true },
            ),
        );
}

function importMap() {
    openMap();
    cy.contains('summary', '3D heightmap').click();
    cy.get('[aria-label="Heightmap relief height"]')
        .type('{selectall}2')
        .blur();
    cy.screenshot('heightmap-import', { capture: 'viewport' });
    cy.contains('button', 'Use as 3D heightmap').click();
    cy.get('[role="dialog"]').should('not.exist');
}

function holdWorker(fragment) {
    cy.window().then((win) => {
        const RealWorker = win.Worker;
        win.Worker = class extends RealWorker {
            constructor(url, options) {
                super(url, options);
                this.target = String(url).includes(fragment);
                this.stops = 0;
            }
            deliver(callback, event) {
                if (
                    this.target &&
                    !win.heldHeightmap &&
                    (event.data.result || event.data.field)
                ) {
                    win.heldHeightmap = {
                        release: () => callback(event),
                        stopped: () => this.stops,
                    };
                } else callback(event);
            }
            addEventListener(type, callback, ...rest) {
                return super.addEventListener(
                    type,
                    type === 'message'
                        ? (event) => this.deliver(callback, event)
                        : callback,
                    ...rest,
                );
            }
            set onmessage(callback) {
                super.onmessage = (event) => this.deliver(callback, event);
            }
            get onmessage() {
                return super.onmessage;
            }
            terminate() {
                this.stops++;
                return super.terminate();
            }
        };
    });
}

it('imports a heightmap and machines it through retained 3D Milling, history and project reload', () => {
    cy.viewport(1280, 720);
    cy.freshProject();
    importMap();
    let mesh, raw;
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.have.length(1);
        const image = p.bitmaps[0];
        mesh = image.surfaceMesh;
        expect(mesh.bounds.minZ).to.equal(0);
        expect(mesh.bounds.maxZ).to.be.closeTo(2, 1e-8);
        expect(image.x + image.w / 2).to.be.closeTo(p.stock.widthMm / 2, 1e-8);
        expect(image.y + image.h / 2).to.be.closeTo(p.stock.heightMm / 2, 1e-8);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.bitmaps).to.have.length(0));
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) =>
        expect(p.bitmaps[0].surfaceMesh).to.deep.equal(mesh),
    );
    cy.addOperation('3D Surface Finish');
    cy.readDownload('.gcode').then((code) => {
        const heights = Array.from(code.matchAll(/\bZ(-?[\d.]+)/g), (match) =>
            Number(match[1]),
        ).filter((z) => z <= 0);
        expect(Math.min(...heights)).to.be.at.least(-2.001);
        expect(Math.min(...heights)).to.be.lessThan(-1.5);
        expect(Math.max(...heights)).to.be.at.most(0.001);
    });
    cy.snapshot().then((p) =>
        expect(p.bitmaps[0].surfaceMesh).to.deep.equal(mesh),
    );
    cy.readDownload('.gcam.json').then((text) => {
        raw = text;
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'heightmap.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].surfaceMesh).to.deep.equal(mesh);
        expect(p.stack).to.have.length(1);
    });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) =>
        expect(code).not.to.match(/NaN|Infinity/),
    );
    cy.get('button[aria-label^="Edit 3D"]')
        .closest('.animate-in')
        .should('have.css', 'opacity', '1');
    cy.screenshot('heightmap-milling', { capture: 'viewport' });
});

it('cancels a real heightmap worker and ignores late delivery without changing the drawing', () => {
    cy.freshProject();
    openMap();
    cy.contains('summary', '3D heightmap').click();
    holdWorker('bitmap-heightmap.worker');
    cy.contains('button', 'Use as 3D heightmap').click();
    cy.window().should((win) => expect(win.heldHeightmap).to.exist);
    cy.contains('button', /^Cancel$/).click();
    cy.window().then((win) => {
        expect(win.heldHeightmap.stopped()).to.be.greaterThan(0);
        win.heldHeightmap.release();
    });
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.have.length(0);
        expect(p.loops).to.have.length(0);
    });
});

it('rejects transparency clearly and keeps heightmap controls out of Laser', () => {
    cy.freshProject({ tools: false });
    openMap(true);
    cy.contains('summary', '3D heightmap').click();
    cy.contains('button', 'Use as 3D heightmap').click();
    cy.get('[role="alert"]').should('contain.text', 'opaque');
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => expect(p.bitmaps).to.have.length(0));
    cy.get('[aria-label="Laser"]').click();
    openMap();
    cy.contains('summary', '3D heightmap').should('not.exist');
    cy.contains('button', /^Cancel$/).click();
});

it('aborts an obsolete surface raster after its source image moves', () => {
    cy.freshProject();
    importMap();
    cy.contains('button', /^3D Surface Finish$/).click();
    cy.get('button[aria-label="Tool library slot"]').click();
    cy.contains('[role="option"]', 'Test ball').click();
    cy.field('Machining detail', 1);
    holdWorker('surface-raster');
    cy.contains('button', /^Add Toolpath/).click();
    cy.window().should((win) => expect(win.heldHeightmap).to.exist);
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.window().should((win) =>
        expect(win.heldHeightmap.stopped()).to.be.greaterThan(0),
    );
    cy.window().then((win) => win.heldHeightmap.release());
    cy.contains('Artwork or settings changed. Generate again.').should('exist');
    cy.snapshot().then((p) => expect(p.stack).to.have.length(0));
    cy.contains('button', /^Add Toolpath/)
        .should('be.enabled')
        .click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/, {
        timeout: 60000,
    }).should('be.enabled');
    cy.snapshot().then((p) => expect(p.stack).to.have.length(1));
});
