describe('Drawing layers', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('layers.svg');
    });
    const openLayers = () => {
        cy.get('body').then(($body) => {
            const toggle = $body.find('[aria-label="Toolpath settings"]');
            if (toggle.length && toggle.is(':visible')) cy.wrap(toggle).click();
        });
        cy.get('[aria-label="Drawing layers"]').should('be.visible');
    };
    const addLayer = (name) => {
        cy.get('[aria-label="Add layer"]').click();
        cy.get('[aria-label="New layer name"]').type(name);
        cy.get('[aria-label="Create layer"]').click();
    };
    it('imports names and same-colour layers, moves shapes and undoes layer removal', () => {
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(2);
            expect(
                p.layers.filter((l) => l.color === '#ff0000'),
            ).to.have.length(2);
        });
        openLayers();
        addLayer('Drilling');
        cy.get('[aria-label="Select layer Cuts"]').click();
        cy.worldProperties(10, 20);
        cy.get('[aria-label^="Move selected to "]').should('not.exist');
        cy.get('[aria-label="Shape layer"]').should('be.visible');
        cy.snapshot().then((p) => {
            const target = p.layers.find((layer) => layer.name === 'Drilling');
            const original = p.loops.find((loop) => loop.id === p.selected[0]);
            cy.get('[aria-label="Shape layer"]').select(target.id);
            cy.snapshot().then((after) => {
                const changed = after.loops.find(
                    (loop) => loop.id === original.id,
                );
                expect(changed.points).to.deep.equal(original.points);
                expect(changed.layerId).to.equal(target.id);
                cy.get('[aria-label="Select layer Cuts"]').should('not.exist');
                cy.get('[aria-label="Select layer Drilling"]').should(
                    'be.visible',
                );
            });
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
        cy.get('[aria-label="Select layer Pockets"]').click();
        cy.get('[aria-label="Edit active layer"]').click();
        cy.get('[aria-label="Layer name"]').clear().type('Shallow pockets');
        cy.get('[aria-label="Save layer"]').click();
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
        addLayer('Engrave');
        cy.get('[aria-label="Select layer Engrave"]').should('not.exist');
        cy.get('[aria-label="Select layer Cuts"]').click();
        cy.worldProperties(10, 20);
        cy.snapshot().then((p) => {
            const target = p.layers.find((layer) => layer.name === 'Engrave');
            cy.get('[aria-label="Shape layer"]').select(target.id);
        });
        cy.get('[aria-label="Select layer Engrave"]').should(
            'have.attr',
            'aria-pressed',
            'false',
        );
        cy.screenshot('layers-tablet', { capture: 'viewport' });
    });
    it('removes a vacated layer while keeping occupied layers, and restores it on undo', () => {
        openLayers();
        cy.get('[aria-label="Select layer Cuts"]').click();
        cy.get('[aria-label="Delete selection"]').click();
        cy.contains(
            '[role="alertdialog"] button',
            /^Delete selection$/,
        ).click();
        cy.get('[aria-label="Select layer Cuts"]').should('not.exist');
        cy.get('[aria-label="Select layer Pockets"]').should('be.visible');
        cy.get('[aria-label="Undo"]').click();
        cy.get('[aria-label="Select layer Cuts"]').should('be.visible');
    });
    it('hides layers and restores the empty canvas after deleting all vectors, with undo and redo', () => {
        openLayers();
        cy.worldDrag([0, 100], [100, 0]);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(2));
        cy.get('[aria-label="Delete selection"]').click();
        cy.contains(
            '[role="alertdialog"] button',
            /^Delete selection$/,
        ).click();
        cy.get('[aria-label="Drawing layers"]').should('not.exist');
        cy.contains('How would you like to begin?').should('be.visible');
        cy.get('[aria-label="Undo"]').click();
        cy.get('[aria-label="Drawing layers"]').should('be.visible');
        cy.snapshot().then((p) => expect(p.loops).to.have.length(2));
        cy.get('[aria-label="Redo"]').click();
        cy.get('[aria-label="Drawing layers"]').should('not.exist');
        cy.wait(900);
        cy.reload();
        cy.get('[aria-label="Drawing layers"]').should('not.exist');
        cy.contains('How would you like to begin?').should('be.visible');
    });
});
