const dialog = '[role="dialog"][aria-label="Adjust laser image"]';
const pane = (name) => `${dialog} canvas[aria-label="${name}"]`;
const view = (name) =>
    cy.get(pane(name)).then(($c) => JSON.parse($c.attr('data-view')));
function ready() {
    cy.get(dialog)
        .contains('button', 'Apply image settings', { timeout: 30000 })
        .should('be.enabled');
}
function setup() {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('laser-image-modes.png');
    cy.contains(/Bitmap .+ placed/).should('exist');
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.contains('label', /^Resolution/)
        .find('input')
        .type('{selectall}127')
        .blur();
}
function dragNative(selector, dx, dy) {
    cy.get(selector).then(async ($c) => {
        const canvas = $c[0],
            win = canvas.ownerDocument.defaultView,
            r = canvas.getBoundingClientRect(),
            frame =
                win.frameElement ??
                win.top.document.querySelector('iframe.aut-iframe'),
            f = frame.getBoundingClientRect(),
            sx = f.width / win.innerWidth,
            sy = f.height / win.innerHeight;
        const x = f.left + (r.left + r.width / 2) * sx,
            y = f.top + (r.top + r.height / 2) * sy;
        const send = (type, x, y, buttons) =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Input.dispatchMouseEvent',
                params: {
                    type,
                    x,
                    y,
                    button: 'left',
                    buttons,
                    clickCount: 1,
                    pointerType: 'mouse',
                },
            });
        await send('mousePressed', x, y, 1);
        await send('mouseMoved', x + dx * sx, y + dy * sy, 1);
        await send('mouseReleased', x + dx * sx, y + dy * sy, 0);
    });
}
function pinchNative(selector) {
    cy.get(selector).then(async ($c) => {
        const canvas = $c[0],
            win = canvas.ownerDocument.defaultView;
        const r = canvas.getBoundingClientRect();
        const frame =
            win.frameElement ??
            win.top.document.querySelector('iframe.aut-iframe');
        const f = frame.getBoundingClientRect(),
            sx = f.width / win.innerWidth,
            sy = f.height / win.innerHeight;
        const x = f.left + (r.left + r.width / 2) * sx,
            y = f.top + (r.top + r.height / 2) * sy;
        const send = (type, distance) =>
            Cypress.automation('remote:debugger:protocol', {
                command: 'Input.dispatchTouchEvent',
                params: {
                    type,
                    touchPoints: distance
                        ? [
                              { id: 1, x: x - distance * sx, y },
                              { id: 2, x: x + distance * sx, y },
                          ]
                        : [],
                },
            });
        await send('touchStart', 30);
        await send('touchMove', 45);
        await send('touchEnd', 0);
    });
}
describe('Linked image adjustment workbench', () => {
    it('links zoom, pan and crop-aware source/processed views, and Cancel leaves settings intact', () => {
        setup();
        cy.get('[aria-label="Crop left percent"]').type('{selectall}25').blur();
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}75')
            .blur();
        let original;
        cy.snapshot().then((p) => {
            original = p;
        });
        cy.contains('button', 'Adjust image…').click();
        ready();
        cy.get(dialog)
            .contains('[aria-label="Processed image size"]', '200 × 200 px')
            .should('exist');
        let initial, zoomed;
        view('Source region').then((v) => {
            initial = v;
        });
        cy.get(`${dialog} [aria-label="Zoom image in"]`).click();
        view('Processed image').then((v) => {
            zoomed = v;
            expect(v.scale).to.be.greaterThan(initial.scale);
        });
        view('Source region').then((v) => expect(v).to.deep.equal(zoomed));
        dragNative(pane('Processed image'), 35, 20);
        view('Processed image').then((v) => {
            expect(v.x - zoomed.x).to.be.closeTo(35, 1);
            expect(v.y - zoomed.y).to.be.closeTo(20, 1);
            zoomed = v;
        });
        view('Source region').then((v) => expect(v).to.deep.equal(zoomed));
        cy.get(pane('Source region'))
            .focus()
            .trigger('keydown', { key: 'ArrowRight' });
        view('Processed image').then((v) =>
            expect(v.x).to.be.closeTo(zoomed.x + 20, 1),
        );
        let beforePinch;
        view('Source region').then((v) => {
            beforePinch = v;
        });
        pinchNative(pane('Source region'));
        view('Processed image').then((v) => {
            expect(v.scale).to.be.greaterThan(beforePinch.scale * 1.2);
        });
        cy.get(dialog).contains('button', /^1:1$/).click();
        view('Processed image').then((v) => expect(v.scale).to.equal(1));
        cy.get(dialog)
            .contains('label', 'Invert display')
            .find('input')
            .check();
        cy.get(pane('Processed image')).should(
            'have.css',
            'filter',
            'invert(1)',
        );
        cy.get(pane('Source region')).should('have.css', 'filter', 'none');
        cy.get(dialog)
            .contains('label', /^Image mode/)
            .find('select')
            .select('stucki');
        cy.get('[aria-label="Adjustment gamma"]').type('{selectall}1.8').blur();
        ready();
        cy.screenshot('laser-linked-image-adjust', { capture: 'viewport' });
        cy.get(dialog)
            .contains('button', /^Cancel$/)
            .click();
        cy.contains('label', /^Image mode/)
            .find('select')
            .should('have.value', 'grayscale');
        cy.contains('label', /^Gamma/)
            .find('input')
            .should('have.value', '1');
        cy.contains('label', /^Resolution/)
            .find('input')
            .should('have.value', '127');
        cy.get('[aria-label="Crop left percent"]').should('have.value', '25');
        cy.snapshot().then((p) => {
            expect(p.stack).to.have.length(0);
            expect(p.loops).to.deep.equal(original.loops);
            expect(p.bitmaps).to.deep.equal(original.bitmaps);
        });
    });
    it('applies staged settings and keeps display-only inversion out of PNG and actual G-code', () => {
        setup();
        cy.contains('button', 'Adjust image…').click();
        ready();
        cy.get(dialog)
            .contains('label', /^Image mode/)
            .find('select')
            .select('threshold');
        cy.get('[aria-label="Adjustment DPI"]').type('{selectall}254').blur();
        cy.get('[aria-label="Adjustment gamma"]').type('{selectall}1.3').blur();
        ready();
        cy.get(dialog).contains('button', /^1:1$/).click();
        let sample;
        cy.get(pane('Processed image')).then(($c) => {
            const c = $c[0];
            sample = Array.from(
                c
                    .getContext('2d')
                    .getImageData(
                        Math.floor(c.width / 2),
                        Math.floor(c.height / 2),
                        1,
                        1,
                    ).data,
            );
        });
        cy.get(dialog)
            .contains('label', 'Invert display')
            .find('input')
            .check();
        cy.get(dialog).contains('button', 'Apply image settings').click();
        cy.contains('label', /^Image mode/)
            .find('select')
            .should('have.value', 'threshold');
        cy.contains('label', /^Gamma/)
            .find('input')
            .should('have.value', '1.3');
        cy.contains('label', /^Resolution/)
            .find('input')
            .should('have.value', '254');
        cy.task('clearDownloads');
        cy.contains('button', 'Save processed PNG').click();
        cy.readFile('cypress/downloads/processed-laser-image.png', 'base64', {
            timeout: 30000,
        }).then((base64) =>
            cy.window().then(async (win) => {
                const image = new win.Image();
                image.src = 'data:image/png;base64,' + base64;
                await image.decode();
                const c = win.document.createElement('canvas');
                c.width = image.naturalWidth;
                c.height = image.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.drawImage(image, 0, 0);
                expect(
                    Array.from(
                        ctx.getImageData(
                            Math.floor(c.width / 2),
                            Math.floor(c.height / 2),
                            1,
                            1,
                        ).data,
                    ),
                ).to.deep.equal(sample);
            }),
        );
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserSpot).to.be.closeTo(0.1, 1e-9);
            expect(p.stack[0].args.laserGamma).to.equal(1.3);
            expect(p.stack[0].args.laserOptions.imageMode).to.equal(
                'threshold',
            );
            expect(p.stack[0].args.laserOptions.invert ?? false).to.equal(
                false,
            );
            expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S250');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.contains('button', 'Adjust image…').should('be.enabled').click();
        ready();
        cy.get('[aria-label="Adjustment gamma"]').should('have.value', '1.3');
        cy.get(dialog)
            .contains('label', /^Brightness/)
            .find('input')
            .type('{selectall}0.1')
            .blur();
        ready();
        cy.get(dialog).contains('button', 'Apply image settings').click();
        cy.contains('button', /^Save Toolpath$/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) =>
            expect(p.stack[0].args.laserOptions.brightness).to.equal(0.1),
        );
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(p.stack[0].args.laserOptions.brightness ?? 0).to.equal(0),
        );
    });
    it('recovers from invalid adjustments and shares source-pixel cropping with pass-through', () => {
        setup();
        cy.get('[aria-label="Crop left percent"]')
            .type('{selectall}12.5')
            .blur();
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}87.5')
            .blur();
        cy.contains('button', 'Adjust image…').click();
        ready();
        cy.get('[aria-label="Adjustment gamma"]').type('{selectall}0').blur();
        cy.get(dialog)
            .contains('[role="alert"]', 'Invalid image resolution or gamma.')
            .should('be.visible');
        cy.get(dialog)
            .contains('button', 'Apply image settings')
            .should('be.disabled');
        cy.get('[aria-label="Adjustment gamma"]').type('{selectall}1').blur();
        ready();
        cy.get(dialog)
            .contains('label', 'Pixel pass-through')
            .find('input')
            .check();
        ready();
        cy.get(dialog)
            .contains('[aria-label="Processed image size"]', '96 × 64 px')
            .should('exist');
        cy.get('[aria-label="Adjustment DPI"]').should('be.disabled');
        cy.get('[aria-label="Adjustment gamma"]').should('be.disabled');
        cy.get(dialog)
            .contains('label', /^Image mode/)
            .find('select')
            .should('be.disabled');
        cy.get(dialog).contains('button', 'Apply image settings').click();
        cy.get('[aria-label="Pixel pass-through"]').should('be.checked');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Raster"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.passThrough).to.equal(true);
            expect(p.stack[0].args.laserOptions.imageCrop).to.deep.equal({
                left: 0.125,
                bottom: 0,
                right: 0.875,
                top: 1,
            });
        });
    });
});
