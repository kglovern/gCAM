describe('Drawing layers', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('layers.svg');
    });
    const openLayers = () => {
        cy.get('button[aria-label="File"]').parent().trigger('mouseleave');
        cy.menu('View', /Object Browser/);
        cy.get('button[aria-label="View"]').parent().trigger('mouseleave');
    };
    it('imports names and same-colour layers, moves shapes and undoes layer removal', () => {
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(2);
            expect(
                p.layers.filter((l) => l.color === '#ff0000'),
            ).to.have.length(2);
        });
        openLayers();
        cy.get('[aria-label="Drawing layers"]').within(() => {
            cy.get('[aria-label="New layer name"]').type('Drilling');
            cy.contains('button', /^Add$/).click();
            cy.get('[aria-label="Rename layer Cuts"]')
                .parent()
                .parent()
                .contains('button', /^Select$/)
                .click();
            cy.get('[aria-label="Rename layer Drilling"]')
                .parent()
                .parent()
                .contains('button', 'Move selected')
                .click();
        });
        cy.snapshot().then((p) => {
            const layer = p.layers.find((l) => l.name === 'Drilling');
            expect(
                p.loops.filter((l) => l.layerId === layer.id),
            ).to.have.length(1);
        });
        cy.get(
            '[aria-label="Remove layer Drilling; keep shapes in Default"]',
        ).click();
        cy.snapshot().then((p) =>
            expect(
                p.loops.filter((l) => l.layerId === 'default'),
            ).to.have.length(1),
        );
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(p.layers.some((l) => l.name === 'Drilling')).to.equal(true),
        );
    });
    it('hides a layer, restores it, and persists layer metadata through recovery', () => {
        openLayers();
        cy.get('[aria-label="Hide layer Cuts"]').click();
        cy.snapshot().then((p) => expect(p.hidden).to.have.length(1));
        cy.get('[aria-label="Show layer Cuts"]').click();
        cy.get('[aria-label="Rename layer Pockets"]')
            .clear()
            .type('Shallow pockets')
            .blur();
        cy.wait(900);
        cy.reload();
        cy.contains('Recovered the last local project.');
        cy.snapshot().then((p) => {
            expect(p.hidden).to.have.length(0);
            expect(p.layers.some((l) => l.name === 'Shallow pockets')).to.equal(
                true,
            );
        });
    });
    it('keeps layer controls reachable on a tablet sized workspace', () => {
        cy.viewport(1280, 800);
        openLayers();
        cy.get('[aria-label="New layer name"]')
            .should('be.visible')
            .type('Engrave');
        cy.get('[aria-label="Drawing layers"]')
            .contains('button', /^Add$/)
            .click();
        cy.get('[aria-label="Draw on Engrave"]').should('be.checked');
        cy.screenshot('layers-tablet', { capture: 'viewport' });
    });
    it('saves a layer-only project and draws onto its recovered active layer', () => {
        cy.freshProject();
        openLayers();
        cy.get('[aria-label="New layer name"]').type('Pockets');
        cy.get('[aria-label="Drawing layers"]')
            .contains('button', /^Add$/)
            .click();
        cy.get('[aria-label="Close object browser"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(0);
            expect(p.layers.some((layer) => layer.name === 'Pockets')).to.equal(
                true,
            );
        });
        cy.wait(900);
        cy.reload();
        cy.contains('Recovered the last local project.');
        cy.menu('Draw', 'Rectangle');
        cy.worldClick(30, 30);
        cy.worldClick(60, 50);
        cy.snapshot().then((p) => {
            const layer = p.layers.find((layer) => layer.name === 'Pockets');
            expect(p.loops).to.have.length(1);
            expect(p.loops[0].layerId).to.equal(layer.id);
        });
    });
});
