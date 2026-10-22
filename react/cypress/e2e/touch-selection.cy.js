describe('Directional and touch selection', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
    });
    it('encloses left to right and crosses right to left', () => {
        cy.worldDrag([15, 65], [25, 35]);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(0));
        cy.worldDrag([25, 35], [15, 65]);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
        cy.worldDrag([15, 65], [45, 35]);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
    });
    it('selects with one touch and cancels selection while two fingers navigate', () => {
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const canvas = $canvas[0];
            // Synthetic pointers have no native capture; browser capture is used on hardware.
            cy.stub(canvas, 'setPointerCapture');
            const camera = JSON.parse(canvas.dataset.camera),
                rect = canvas.getBoundingClientRect();
            const at = (x, y) => ({
                clientX: rect.left + camera.tx + x * camera.scale,
                clientY: rect.top + camera.ty - y * camera.scale,
            });
            const pointer = (name, id, point, buttons = 1) =>
                canvas.dispatchEvent(
                    new PointerEvent(name, {
                        bubbles: true,
                        cancelable: true,
                        pointerId: id,
                        pointerType: 'touch',
                        button: 0,
                        buttons,
                        ...point,
                    }),
                );
            pointer('pointerdown', 1, at(15, 65));
            pointer('pointermove', 1, at(45, 35));
            pointer('pointerup', 1, at(45, 35), 0);
        });
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const canvas = $canvas[0],
                rect = canvas.getBoundingClientRect();
            const original = JSON.parse(canvas.dataset.camera);
            const pointer = (name, id, x, y, buttons = 1) =>
                canvas.dispatchEvent(
                    new PointerEvent(name, {
                        bubbles: true,
                        cancelable: true,
                        pointerId: id,
                        pointerType: 'touch',
                        button: 0,
                        buttons,
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                    }),
                );
            pointer('pointerdown', 1, 100, 100);
            pointer('pointerdown', 2, 200, 100);
            pointer('pointermove', 2, 250, 130);
            pointer('pointerup', 2, 250, 130, 0);
            pointer('pointermove', 1, 150, 200);
            pointer('pointerup', 1, 150, 200, 0);
            cy.wrap($canvas).should(($el) => {
                const current = JSON.parse($el.attr('data-camera'));
                expect(current.scale).to.be.greaterThan(original.scale);
                expect(current.tx).not.to.equal(original.tx);
            });
        });
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
    });
    it('exports an individual toolpath from the split button at tablet width', () => {
        cy.viewport(1024, 768);
        cy.worldClick(20, 50);
        cy.addOperation('Outside');
        cy.get('[aria-label="Export individual toolpaths"]').click();
        cy.contains('button', /^1\. /).should('be.visible');
        cy.screenshot('individual-toolpath-export-tablet');
        cy.task('clearDownloads');
        cy.contains('button', /^1\. /).click();
        cy.readDownload('.nc').then((code) => {
            expect(code).to.match(/G21\b/);
            expect(code).to.match(/M(?:2|30)\b/);
            expect(code).not.to.match(/NaN|Infinity|undefined/);
        });
        cy.get('[aria-label="Export individual toolpaths"]').should(
            'have.attr',
            'aria-expanded',
            'false',
        );
    });
});
