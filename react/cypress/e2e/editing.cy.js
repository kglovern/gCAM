const bounds = (loop) => ({
    minX: Math.min(...loop.points.map((p) => p.x)),
    minY: Math.min(...loop.points.map((p) => p.y)),
    maxX: Math.max(...loop.points.map((p) => p.x)),
    maxY: Math.max(...loop.points.map((p) => p.y)),
});
const area = (loop) =>
    Math.abs(
        loop.points.reduce((sum, point, i, points) => {
            const next = points[(i + 1) % points.length];
            return sum + point.x * next.y - point.y * next.x;
        }, 0),
    ) / 2;

describe('Canvas selection and editing', () => {
    beforeEach(() => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
    });
    it('replaces plain-click selection, toggles Ctrl-click, clears empty clicks when additive selection is off', () => {
        cy.freshProject({ multipleSelection: false });
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
        cy.worldClick(50, 50);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
        cy.worldClick(20, 50, { ctrlKey: true });
        cy.snapshot().then((p) => expect(p.selected).to.have.length(2));
        cy.worldClick(20, 50, { ctrlKey: true });
        cy.snapshot().then((p) => expect(p.selected).to.have.length(1));
        cy.worldClick(45, 80);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(0));
    });
    it('groups and ungroups parts, then nests them inside a sheet', () => {
        cy.worldClick(20, 50);
        cy.worldClick(50, 50, { ctrlKey: true });
        cy.menu('Group', /^Group$/);
        cy.snapshot().then((p) => {
            const grouped = p.loops.filter((loop) => loop.groupId);
            expect(grouped).to.have.length(2);
            expect(grouped[0].groupId).to.equal(grouped[1].groupId);
        });
        cy.menu('Group', /^Ungroup$/);
        cy.snapshot().then((p) =>
            expect(p.loops.some((loop) => loop.groupId)).to.equal(false),
        );
        cy.menu('Modify', 'Nest…');
        cy.get('[aria-label="W in mm"]').clear().type('100');
        cy.get('[aria-label="H in mm"]').clear().type('100');
        cy.contains('button', /^Nest$/).click();
        cy.snapshot().then((p) => {
            const boxes = p.loops
                .filter((loop) => p.selected.includes(loop.id))
                .map(bounds);
            expect(boxes).to.have.length(2);
            for (const box of boxes) {
                expect(box.minX).to.be.at.least(0);
                expect(box.minY).to.be.at.least(0);
                expect(box.maxX).to.be.at.most(100);
                expect(box.maxY).to.be.at.most(100);
            }
            const [a, b] = boxes;
            expect(
                a.maxX <= b.minX ||
                    b.maxX <= a.minX ||
                    a.maxY <= b.minY ||
                    b.maxY <= a.minY,
            ).to.equal(true);
        });
    });
    it('zooms, fits, clones, deletes, undoes and redoes', () => {
        cy.get('[data-testid="gcam-canvas"]')
            .invoke('attr', 'data-camera')
            .then((raw) => {
                const original = JSON.parse(raw).scale;
                cy.menu('View', 'Zoom In');
                cy.get('[data-testid="gcam-canvas"]').should(($el) =>
                    expect(
                        JSON.parse($el.attr('data-camera')).scale,
                    ).to.be.greaterThan(original),
                );
                cy.menu('View', 'Zoom Out');
                cy.get('[data-testid="gcam-canvas"]').should(($el) =>
                    expect(
                        JSON.parse($el.attr('data-camera')).scale,
                    ).to.be.closeTo(original, 0.01),
                );
            });
        cy.menu('View', 'Fit View');
        cy.worldClick(20, 50);
        cy.get('[aria-label="Clone selection"]').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(4));
        cy.get('[aria-label="Delete selection"]').click();
        cy.contains(
            '[role="alertdialog"] button',
            /^Delete selection$/,
        ).click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(3));
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(4));
        cy.get('[aria-label="Redo"]').click();
        cy.snapshot().then((p) => expect(p.loops).to.have.length(3));
    });
    it('edits position and dimensions through shape properties', () => {
        cy.worldClick(20, 50);
        cy.get('[aria-label="Selected shape properties"]').should('not.exist');
        cy.worldProperties(20, 50);
        cy.field('X (mm)', 25);
        cy.field('Y (mm)', 45);
        cy.field('Width (mm)', 30);
        cy.field('Height (mm)', 10);
        cy.contains('button', /^Apply$/).click();
        cy.snapshot().then((p) => {
            const box = bounds(
                p.loops.find((loop) => p.selected.includes(loop.id)),
            );
            expect(box.minX).to.be.closeTo(25, 0.01);
            expect(box.minY).to.be.closeTo(45, 0.01);
            expect(box.maxX - box.minX).to.be.closeTo(30, 0.01);
            expect(box.maxY - box.minY).to.be.closeTo(10, 0.01);
        });
    });
    it('moves a selection by dragging and selects with a marquee', () => {
        cy.worldClick(20, 50);
        cy.get('[aria-label="Transform selection"]').click();
        cy.worldDrag([30, 50], [40, 60]);
        cy.snapshot().then((p) => {
            const box = bounds(
                p.loops.find((loop) => p.selected.includes(loop.id)),
            );
            expect(box.minX).to.be.closeTo(30, 0.1);
            expect(box.minY).to.be.closeTo(50, 0.1);
        });
        cy.get('[aria-label="Select shapes"]').click();
        cy.worldDrag([25, 35], [75, 75]);
        cy.snapshot().then((p) => expect(p.selected).to.have.length(2));
    });
});
describe('Boolean and trim operations', () => {
    beforeEach(() => cy.freshProject());
    for (const [operation, expected] of [
        ['union', 600],
        ['difference', 200],
        ['intersection', 200],
        ['xor', 400],
    ]) {
        it(`computes ${operation} with the expected area`, () => {
            cy.importDesign('overlap.svg');
            cy.worldClick(25, 40);
            cy.worldClick(45, 40, { ctrlKey: true });
            cy.menu('Modify', 'Combine / Subtract…');
            cy.contains('label', 'Operation').find('select').select(operation);
            cy.contains('button', /^Apply$/).click();
            cy.snapshot().then((p) =>
                expect(
                    p.loops.reduce((sum, loop) => sum + area(loop), 0),
                ).to.be.closeTo(expected, 0.1),
            );
        });
    }
    it('removes only the segment between crossing vectors', () => {
        cy.importDesign('trim.svg');
        cy.get('[aria-label="Trim shapes"]').click();
        cy.worldClick(40, 50);
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(4);
            const horizontal = p.loops.filter((loop) =>
                loop.points.every((point) => Math.abs(point.y - 50) < 0.01),
            );
            expect(horizontal).to.have.length(2);
            expect(
                horizontal.reduce(
                    (sum, loop) => sum + bounds(loop).maxX - bounds(loop).minX,
                    0,
                ),
            ).to.be.closeTo(20, 0.1);
        });
    });
    it('trims an unsegmented crossing with a Ctrl brush and supports undo', () => {
        cy.importDesign('trim.svg');
        cy.get('[aria-label="Trim shapes"]').click();
        cy.worldDrag([40, 45], [40, 55], { ctrlKey: true });
        cy.snapshot().then((p) => expect(p.loops).to.have.length(4));
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(3);
            const horizontal = p.loops.find((l) =>
                l.points.every((point) => Math.abs(point.y - 50) < 0.01),
            );
            expect(horizontal.points).to.have.length(2);
        });
    });
    it('offsets a selected closed shape', () => {
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.menu('Modify', 'Offset…');
        cy.get('[aria-label="Amount in mm"]')
            .clear()
            .type('2')
            .blur()
            .should('have.value', '2');
        cy.contains('button', /^Offset$/).click();
        cy.snapshot().then((p) => {
            const box = bounds(
                p.loops.find((loop) => p.selected.includes(loop.id)),
            );
            expect(box.minX).to.be.closeTo(18, 0.01);
            expect(box.minY).to.be.closeTo(38, 0.01);
            expect(box.maxX).to.be.closeTo(42, 0.01);
            expect(box.maxY).to.be.closeTo(62, 0.01);
        });
    });
    it('fillets one corner without changing the other parts', () => {
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.menu('Modify', 'Fillet…');
        cy.worldClick(20, 40);
        cy.get('[aria-label="Radius (mm)"]').clear().type('2').blur();
        cy.contains('[role=dialog] button', /^Apply$/).click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(3);
            const loop = p.loops.find((item) => p.selected.includes(item.id));
            expect(loop.points.length).to.be.greaterThan(5);
            expect(area(loop)).to.be.within(398, 400);
        });
    });
    it('chamfers the selected rectangle by the requested distance', () => {
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.menu('Modify', 'Chamfer…');
        cy.worldClick(20, 40);
        cy.get('[aria-label="Distance (mm)"]').clear().type('2').blur();
        cy.contains('[role=dialog] button', /^Apply$/).click();
        cy.snapshot().then((p) => {
            const loop = p.loops.find((item) => p.selected.includes(item.id));
            expect(area(loop)).to.be.closeTo(398, 0.1);
        });
    });
    it('adds dogbone relief at a clicked corner', () => {
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.menu('Modify', /^Dogbone$/);
        cy.worldClick(20, 40);
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(3);
            const loop = p.loops.find((item) => p.selected.includes(item.id));
            expect(loop.points.length).to.be.greaterThan(8);
            expect(area(loop)).to.be.greaterThan(0);
        });
    });
});
