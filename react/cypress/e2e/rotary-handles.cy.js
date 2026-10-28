describe('Rotary Bezier handle safety', () => {
    it('keeps the rendered curve forward during extreme handle and node drags', () => {
        cy.freshProject();
        cy.get('[aria-label="Rotary"]').click();
        cy.get('[aria-label="Load template"]').select('cabinetKnob');
        const editor = '[aria-label="Profile editor"]';
        const forward = () =>
            cy.get(editor).should(($svg) => {
                const path = $svg[0].querySelector('path'),
                    length = path.getTotalLength();
                let previous = -Infinity,
                    minStep = Infinity,
                    finite = true;
                for (let i = 0; i <= 400; i++) {
                    const p = path.getPointAtLength((length * i) / 400);
                    finite =
                        finite && Number.isFinite(p.x) && Number.isFinite(p.y);
                    minStep = Math.min(minStep, p.x - previous);
                    previous = p.x;
                }
                expect(finite).to.equal(true);
                expect(minStep).to.be.at.least(-0.001);
            });
        const drag = (selector, dx, dy) => {
            cy.get(`${editor} ${selector}`).then(($handle) => {
                const rect = $handle[0].getBoundingClientRect(),
                    x = rect.left + rect.width / 2,
                    y = rect.top + rect.height / 2;
                cy.wrap($handle).trigger('pointerdown', {
                    force: true,
                    eventConstructor: 'PointerEvent',
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: x,
                    clientY: y,
                });
                cy.get(editor).trigger('pointermove', {
                    force: true,
                    eventConstructor: 'PointerEvent',
                    pointerId: 1,
                    pointerType: 'mouse',
                    buttons: 1,
                    clientX: x + dx,
                    clientY: y + dy,
                });
                forward();
                cy.get(editor).trigger('pointerup', {
                    force: true,
                    eventConstructor: 'PointerEvent',
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: x + dx,
                    clientY: y + dy,
                });
                forward();
            });
        };
        for (const [dx, dy] of [
            [1000, -300],
            [-1000, 300],
            [100, -100],
            [-300, -200],
        ]) {
            drag('circle[data-i="3"][data-h="h2"]', dx, dy);
        }
        drag('circle[data-i="3"]:not([data-h])', 1000, -40);
        cy.get('[aria-label="Undo rotary change"]').click();
        forward();
    });
});
