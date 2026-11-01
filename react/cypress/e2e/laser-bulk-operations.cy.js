describe('Laser bulk operation controls', () => {
    it('updates selected operations atomically, preserves Milling and survives undo/reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.addOperation('Engrave');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').type(
            '{selectall}A{enter}',
        );
        cy.get('[aria-label="Duplicate A"]').click();
        cy.get('[aria-label="Name A copy"]').type('{selectall}B{enter}');
        cy.get('[aria-label="Duplicate A"]').click();
        cy.get('[aria-label="Name A copy"]').type('{selectall}C{enter}');
        let milling;
        const laser = (p) =>
            p.stack.filter((e) => e.args.operation.startsWith('laser-'));
        cy.snapshot().then((p) => {
            milling = p.stack.find(
                (e) => !e.args.operation.startsWith('laser-'),
            );
            expect(laser(p).map((e) => e.label)).to.deep.equal(['A', 'C', 'B']);
        });
        cy.get('[aria-label="Name A"]').scrollIntoView();
        cy.get('[aria-label="Name A"]')
            .closest('.animate-in')
            .should('have.css', 'opacity', '1');
        cy.screenshot('laser-operation-list', { capture: 'viewport' });
        cy.get('[aria-label="Select laser operations"]').click();
        cy.get('[aria-label="Select operation A"]').check();
        cy.get('[aria-label="Select operation C"]').check();
        cy.contains('button', 'Disable selected').click();
        cy.snapshot().then((p) => {
            expect(
                laser(p)
                    .filter((e) => e.outputEnabled === false)
                    .map((e) => e.label),
            ).to.deep.equal(['A', 'C']);
            expect(p.stack.find((e) => e.id === milling.id)).to.deep.equal(
                milling,
            );
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(laser(p).every((e) => e.outputEnabled !== false)).to.equal(
                true,
            ),
        );
        cy.get('[aria-label="Redo"]').click();
        cy.snapshot().then((p) =>
            expect(
                laser(p).filter((e) => e.outputEnabled === false),
            ).to.have.length(2),
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('Laser Cut - B');
            expect(code).not.to.include('Laser Cut - A');
            expect(code).not.to.include('Laser Cut - C');
            expect(code).not.to.match(/G[01] .*Z/);
        });
        cy.contains('button', 'Enable selected').click();
        cy.contains('summary', 'Edit selected settings').click();
        cy.get('[aria-label="Apply selected speed"]').check();
        cy.get('[aria-label="Selected laser speed"]')
            .type('{selectall}900')
            .blur();
        cy.get('[aria-label="Apply selected power"]').check();
        cy.get('[aria-label="Selected laser power"]')
            .type('{selectall}25')
            .blur();
        cy.get('[aria-label="Apply selected passes"]').check();
        cy.get('[aria-label="Selected laser passes"]')
            .type('{selectall}2')
            .blur();
        cy.contains('button', 'Apply to selected').click();
        cy.contains('2 operations updated.', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.snapshot().then((p) => {
            expect(
                laser(p)
                    .filter((e) => e.label === 'A' || e.label === 'C')
                    .every(
                        (e) =>
                            e.args.laserPower === 250 &&
                            e.args.laserFeed === 900 &&
                            e.args.laserOptions.passes === 2,
                    ),
            ).to.equal(true);
            expect(
                laser(p).find((e) => e.label === 'B').args.laserPower,
            ).to.equal(400);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(laser(p).every((e) => e.args.laserPower === 400)).to.equal(
                true,
            ),
        );
        cy.get('[aria-label="Redo"]').click();
        cy.contains('summary', 'Edit selected settings').click();

        cy.contains('button', 'Move selected later').click();
        cy.snapshot().then((p) =>
            expect(laser(p).map((e) => e.label)).to.deep.equal(['B', 'A', 'C']),
        );
        cy.contains('button', 'Duplicate selected').click();
        cy.snapshot().then((p) =>
            expect(laser(p).map((e) => e.label)).to.deep.equal([
                'B',
                'A',
                'A copy',
                'C',
                'C copy',
            ]),
        );
        cy.get('[aria-label="Selected laser operations"]').scrollIntoView();
        cy.screenshot('laser-bulk-operations', { capture: 'viewport' });
        cy.contains('button', 'Delete selected').click();
        cy.get('[role="alertdialog"], [role="dialog"]')
            .contains('button', /^Delete$/)
            .click();
        cy.snapshot().then((p) =>
            expect(laser(p).map((e) => e.label)).to.deep.equal([
                'B',
                'A copy',
                'C copy',
            ]),
        );
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => expect(laser(p)).to.have.length(5));
        cy.get('[aria-label="Redo"]').click();
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack.length === 4 &&
                    !saved.snapshot.stack.some((e) => e.label === 'A')
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Bulk operation changes were not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) => {
            expect(laser(p).map((e) => e.label)).to.deep.equal([
                'B',
                'A copy',
                'C copy',
            ]);
            expect(laser(p).every((e) => e.outputEnabled !== false)).to.equal(
                true,
            );
            expect(p.stack.find((e) => e.id === milling.id)).to.deep.equal(
                milling,
            );
        });
    });
});
