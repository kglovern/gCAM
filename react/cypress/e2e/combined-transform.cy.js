describe('Persistent combined transform', () => {
    it('moves, resizes and rotates without switching tools, then exits with Escape', () => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const c = JSON.parse($canvas[0].dataset.camera),
                rect = $canvas[0].getBoundingClientRect();
            cy.wrap($canvas).trigger('contextmenu', {
                eventConstructor: 'MouseEvent',
                clientX: rect.left + c.tx + 20 * c.scale,
                clientY: rect.top + c.ty - 50 * c.scale,
            });
        });
        cy.contains('[role="menuitem"]', /^Transform$/).click();
        const active = () =>
            cy
                .get('[aria-label="Transform selection"]')
                .should('have.attr', 'aria-pressed', 'true');
        active();
        cy.worldDrag([30, 50], [40, 60]);
        active();
        cy.worldDrag([50, 70], [60, 80]);
        active();
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const c = JSON.parse($canvas[0].dataset.camera),
                o = 18 / Math.sqrt(2) / c.scale;
            cy.worldDrag([60 + o, 80 + o], [30 - o, 80 + o]);
        });
        active();
        cy.snapshot().then((p) => {
            const loop = p.loops.find((l) => p.selected.includes(l.id));
            const xs = loop.points.map((p) => p.x),
                ys = loop.points.map((p) => p.y);
            expect(Math.max(...xs) - Math.min(...xs)).to.be.closeTo(30, 0.2);
            expect(Math.max(...ys) - Math.min(...ys)).to.be.closeTo(30, 0.2);
            expect(loop.points[0].x).to.be.closeTo(60, 0.2);
        });
        cy.get('body').type('{esc}');
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'false',
        );
        cy.get('[aria-label="Undo"]').click().click().click();
        cy.snapshot().then((p) => {
            const loop = p.loops.find((l) => p.selected.includes(l.id));
            expect(Math.min(...loop.points.map((p) => p.x))).to.be.closeTo(
                20,
                0.1,
            );
            expect(Math.min(...loop.points.map((p) => p.y))).to.be.closeTo(
                40,
                0.1,
            );
        });
        cy.get('[aria-label="Transform selection"]').click();
        cy.worldDrag([30, 50], [35, 55]);
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'true',
        );
        cy.get('[aria-label="Select shapes"]').click();
        cy.get('[aria-label="Transform selection"]').should(
            'have.attr',
            'aria-pressed',
            'false',
        );
    });
    it('dims the stationary original and keeps only the moving preview blue', () => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.get('[aria-label="Transform selection"]').click();
        cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
            const canvas = $canvas[0],
                c = JSON.parse(canvas.dataset.camera),
                rect = canvas.getBoundingClientRect();
            const screen = (x, y) => ({
                clientX: rect.left + c.tx + x * c.scale,
                clientY: rect.top + c.ty - y * c.scale,
                button: 0,
            });
            cy.wrap($canvas)
                .trigger('mousedown', screen(30, 50))
                .trigger('mousemove', { ...screen(45, 35), buttons: 1 });
            cy.wrap($canvas).should(() => {
                const blue = (x, y) => {
                    const px = Math.round(
                            ((c.tx + x * c.scale) * canvas.width) / rect.width,
                        ),
                        py = Math.round(
                            ((c.ty - y * c.scale) * canvas.height) /
                                rect.height,
                        );
                    const rgba = canvas
                        .getContext('2d')
                        .getImageData(px - 2, py - 2, 5, 5).data;
                    let delta = 0;
                    for (let i = 0; i < rgba.length; i += 4)
                        delta = Math.max(delta, rgba[i + 2] - rgba[i]);
                    return delta;
                };
                expect(blue(20, 50)).to.be.lessThan(40);
                expect(blue(35, 35)).to.be.greaterThan(70);
            });
            cy.screenshot('transform-dimmed-original', { capture: 'viewport' });
            cy.wrap($canvas).trigger('mouseup', screen(45, 35));
        });
    });
});
