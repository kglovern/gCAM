const dialog = '[role="dialog"][aria-label="Edit image mask"]';
function dragNative() {
    cy.get(`${dialog} svg[aria-label="Mask position preview"]`).then(
        async ($svg) => {
            const el = $svg[0],
                win = el.ownerDocument.defaultView,
                r = el.getBoundingClientRect(),
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
            await send('mouseMoved', x + 30 * sx, y - 15 * sy, 1);
            await send('mouseReleased', x + 30 * sx, y - 15 * sy, 0);
        },
    );
}
it('edits a mask independently, retains source artwork and supports job Save/Undo', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('contrast.png');
    cy.contains('button', 'Engrave image').click();
    cy.menu('Draw', 'Rectangle');
    cy.worldClick(30, 30);
    cy.worldClick(70, 70);
    cy.get('[aria-label="Select shapes"]').click();
    cy.get('[aria-label="Select layer Default"]').click();
    cy.contains('button', /^Laser Raster$/).click();
    cy.contains('button', 'Use selected shapes as mask').click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}50').blur();
    cy.contains('button', /^Edit mask/).click();
    dragNative();
    cy.get('[aria-label="Mask move X"]').should(($input) =>
        expect(Number($input.val())).to.be.closeTo(8, 0.1),
    );
    cy.get('[aria-label="Mask move Y"]').should(($input) =>
        expect(Number($input.val())).to.be.closeTo(4, 0.1),
    );
    cy.get(dialog).contains('button', 'Cancel').click();
    cy.contains('button', /^Edit mask/).click();
    cy.get('[aria-label="Mask move X"]').should('have.value', '0');
    cy.get('[aria-label="Mask move X"]').type('{selectall}-10').blur();
    cy.get('[aria-label="Mask scale X"]').type('{selectall}50').blur();
    cy.screenshot('laser-mask-positioning', { capture: 'viewport' });
    cy.get(dialog).contains('button', 'Apply mask').click();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    let sourcePixels, originalMask;
    cy.snapshot().then((p) => {
        sourcePixels = p.bitmaps[0].dataUrl;
        originalMask = p.stack[0].args.laserOptions.imageMask;
        expect(p.loops).to.have.length(2);
        expect(
            p.bitmaps[0].x + originalMask[0][0].x * p.bitmaps[0].w,
        ).to.be.closeTo(30, 1e-6);
        for (const { points } of p.stack[0].toolpath.laserPaths)
            for (let i = 1; i < points.length; i++)
                if (points[i].power > 0)
                    for (const point of [points[i - 1], points[i]])
                        expect(point.x).to.be.within(30 - 1e-6, 50 + 1e-6);
        expect(p.stack[0].toolpath.laserPaths.length).to.be.greaterThan(0);
    });
    cy.get('button[aria-label^="Edit Laser Raster"]').click();
    cy.contains('button', /^Edit mask/).click();
    cy.get('[aria-label="Mask move X"]').type('{selectall}-5').blur();
    cy.get(dialog).contains('button', 'Apply mask').click();
    cy.contains('button', /^Save Toolpath$/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].dataUrl).to.equal(sourcePixels);
        expect(p.stack[0].args.laserOptions.imageMask).not.to.deep.equal(
            originalMask,
        );
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].args.laserOptions.imageMask).to.deep.equal(
            originalMask,
        ),
    );
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S500');
        expect(code).not.to.match(/M6|G[01] Z/);
    });
});
