function holdNextCommit() {
    cy.window().then((win) => {
        const NativeWorker = win.Worker;
        let armed = true;
        win.Worker = class extends NativeWorker {
            stops = 0;
            postMessage(message, ...rest) {
                this.request = message;
                super.postMessage(message, ...rest);
            }
            addEventListener(type, listener, ...rest) {
                if (type !== 'message')
                    return super.addEventListener(type, listener, ...rest);
                return super.addEventListener(
                    type,
                    (event) => {
                        if (
                            armed &&
                            this.request?.type === 'build-toolpath' &&
                            this.request.toolpathOptions?.validateResult !==
                                true &&
                            event.data.result
                        ) {
                            armed = false;
                            win.heldLaserBuild = {
                                release: () => listener(event),
                                stopped: () => this.stops,
                            };
                        } else listener(event);
                    },
                    ...rest,
                );
            }
            terminate() {
                this.stops++;
                super.terminate();
            }
        };
    });
}
function setup() {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('vectors.svg');
    cy.worldClick(20, 50);
    cy.contains('button', /^Laser Cut$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.contains('Calculating toolpath').should('not.exist');
}
it('discards a real completed calculation when its artwork changes before delivery', () => {
    setup();
    let id, firstX;
    cy.snapshot().then((p) => {
        id = p.selected[0];
        firstX = p.loops.find((l) => l.id === id).points[0].x;
    });
    holdNextCommit();
    cy.contains('button', /^Add Toolpath/).click({ waitForAnimations: false });
    cy.window().should((win) => expect(win.heldLaserBuild).to.exist);
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.window().should((win) =>
        expect(
            win.heldLaserBuild.stopped(),
            'obsolete worker terminated',
        ).to.be.greaterThan(0),
    );
    cy.window().then((win) => win.heldLaserBuild.release());
    cy.contains('button', 'Cancel laser build').should('not.exist');
    cy.snapshot().then((p) => {
        expect(p.loops.find((l) => l.id === id).points[0].x).to.equal(
            firstX + 1,
        );
        expect(p.stack, 'stale result must not be added').to.have.length(0);
    });
    cy.get('[aria-label="Laser power percent"]').should('have.value', '40');
    cy.contains('button', /^Add Toolpath/)
        .should('be.enabled')
        .click();
    cy.get('input[aria-label^="Name Laser Cut"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(1);
        expect(p.stack[0].args.loops[0].points[0].x).to.equal(firstX + 1);
    });
});
it('preserves an existing job when settings change during Save, then saves the current values with Undo', () => {
    setup();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Cut"]', { timeout: 30000 }).then(
        (input) => cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
    );
    cy.contains('button', /^Change$/).click();
    holdNextCommit();
    cy.contains('button', /^Save Toolpath$/).click({
        waitForAnimations: false,
    });
    cy.window().should((win) => expect(win.heldLaserBuild).to.exist);
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.window().should((win) =>
        expect(
            win.heldLaserBuild.stopped(),
            'obsolete worker terminated',
        ).to.be.greaterThan(0),
    );
    cy.window().then((win) => win.heldLaserBuild.release());
    cy.contains('button', 'Cancel laser build').should('not.exist');
    cy.contains('Artwork or settings changed. Generate again.').should(
        'be.visible',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(1);
        expect(p.stack[0].args.laserPower).to.equal(400);
    });
    cy.get('[aria-label="Laser power percent"]').should('have.value', '25');
    cy.contains('button', /^Save Toolpath$/)
        .should('be.enabled')
        .click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(1);
        expect(p.stack[0].args.laserPower).to.equal(250);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => expect(p.stack[0].args.laserPower).to.equal(400));
    cy.get('[aria-label="Redo"]').click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => expect(code).to.include('S250'));
});
it('discards raster work when image placement changes and retains its pixels and form settings', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('contrast.png');
    cy.contains(/Bitmap .+ placed/).should('exist');
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.contains('Calculating toolpath').should('not.exist');
    let image;
    cy.snapshot().then((p) => {
        image = p.bitmaps[0];
    });
    holdNextCommit();
    cy.contains('button', /^Add Toolpath/).click({ waitForAnimations: false });
    cy.window().should((win) => expect(win.heldLaserBuild).to.exist);
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.window().should((win) =>
        expect(
            win.heldLaserBuild.stopped(),
            'obsolete worker terminated',
        ).to.be.greaterThan(0),
    );
    cy.window().then((win) => win.heldLaserBuild.release());
    cy.contains('button', 'Cancel laser build').should('not.exist');
    cy.contains('Artwork or settings changed. Generate again.').should(
        'be.visible',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(0);
        expect(p.bitmaps[0].x).to.equal(image.x + 1);
        expect(p.bitmaps[0].dataUrl).to.equal(image.dataUrl);
    });
    cy.get('[aria-label="Laser power percent"]').should('have.value', '40');
    cy.screenshot('laser-stale-build-discarded', { capture: 'viewport' });
    cy.contains('button', /^Add Toolpath/)
        .should('be.enabled')
        .click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(1);
        expect(p.stack[0].args.loops[0].points[0].x).to.equal(image.x + 1);
    });
});

it('keeps a valid build when only the view changes', () => {
    setup();
    holdNextCommit();
    cy.contains('button', /^Add Toolpath/).click({ waitForAnimations: false });
    cy.window().should((win) => expect(win.heldLaserBuild).to.exist);
    cy.menu('View', 'Zoom Out');
    cy.menu('View', 'Dark / Light Mode');
    cy.window().then((win) => {
        expect(win.heldLaserBuild.stopped()).to.equal(0);
        win.heldLaserBuild.release();
    });
    cy.get('input[aria-label^="Name Laser Cut"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(1);
        expect(p.stack[0].args.laserPower).to.equal(400);
    });
});
