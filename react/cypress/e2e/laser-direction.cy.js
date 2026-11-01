describe('Laser directional cut order', () => {
    it('orders shapes right to left and preserves the setting and output after reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldDrag([10, 20], [80, 80]);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Laser cut order"]').select('right-to-left');
        cy.get('[aria-label="Prefer laser corner starts"]').check();
        cy.get('[aria-label="Laser cut order"]').scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-direction-controls', { capture: 'viewport' });
        cy.contains('button', /^Add Toolpath.*3 selected/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        let paths;
        cy.snapshot().then((p) => {
            const path = p.stack[0].toolpath;
            expect(path.laserOptions.cutOrder).to.equal('right-to-left');
            expect(path.laserOptions.preferCornerStarts).to.equal(true);
            expect(path.laserPaths).to.have.length(3);
            expect(
                Math.min(...path.laserPaths[0].points.map((v) => v.x)),
            ).to.equal(50);
            paths = path.laserPaths;
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((summary) => {
            if (!summary.parent().prop('open')) cy.wrap(summary).click();
        });
        cy.get('[aria-label="Laser cut order"]').should(
            'have.value',
            'right-to-left',
        );
        cy.get('[aria-label="Prefer laser corner starts"]').should(
            'be.checked',
        );
        cy.contains('button', 'Cancel Edit').click();
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                if (
                    (await store.load())?.snapshot.stack[0]?.args.laserOptions
                        ?.cutOrder === 'right-to-left'
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Directional settings did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions.cutOrder).to.equal(
                'right-to-left',
            );
            expect(p.stack[0].args.laserOptions.preferCornerStarts).to.equal(
                true,
            );
            expect(p.stack[0].toolpath.laserPaths).to.deep.equal(paths);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.match(/G0 X50(?:\.0+)? Y/);
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
});
