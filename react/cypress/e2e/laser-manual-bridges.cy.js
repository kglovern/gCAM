describe('Manual laser bridges', () => {
    it('places, moves, deletes and reloads bridges using the existing tab interaction', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Laser bridge width"]').type('{selectall}2').blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        const offLength = (p) =>
            p.stack[0].toolpath.laserPaths.reduce(
                (sum, path) =>
                    sum +
                    path.points
                        .slice(1)
                        .reduce(
                            (n, b, i) =>
                                n +
                                (b.power === 0
                                    ? Math.hypot(
                                          b.x - path.points[i].x,
                                          b.y - path.points[i].y,
                                      )
                                    : 0),
                            0,
                        ),
                0,
            );
        const expectTabs = (count, length = count * 2) =>
            cy.snapshot().then((p) => {
                expect(p.stack[0].args.tabs).to.have.length(count);
                expect(offLength(p)).to.be.closeTo(length, 0.00001);
            });
        cy.contains('button', /^Add a Bridge$/).click();
        cy.worldClick(30, 40);
        expectTabs(1);
        cy.worldDrag([30, 40], [35, 40]);
        expectTabs(1);
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.tabs[0].anchor.x).to.be.closeTo(35, 0.01);
            expect(p.stack[0].args.tabs[0].anchor.y).to.be.closeTo(40, 0.01);
        });
        cy.worldClick(40, 50);
        expectTabs(2);
        cy.worldClick(40, 50, { button: 2 });
        expectTabs(1);
        cy.get('[aria-label="Undo"]').click();
        expectTabs(2);
        cy.get('[aria-label="Redo"]').click();
        expectTabs(1);
        cy.contains('button', /Placing bridges/).click();
        cy.screenshot('laser-manual-bridge', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S400');
            expect(code).to.match(/G1 [^\n]*[XY][^\n]*S0/);
            expect(code).not.to.match(/G[01] Z/);
        });
        const editOptions = () => {
            cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
                cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
            );
            cy.contains('summary', 'Laser options').then((summary) => {
                if (!summary.parent().prop('open')) cy.wrap(summary).click();
            });
        };
        const save = () => {
            cy.contains('button', /^Save Toolpath$/).click();
            cy.contains('button', /^Cancel Edit$/).should('not.exist');
        };
        editOptions();
        cy.get('[aria-label="Bridge generation"]').should(
            'have.value',
            'manual',
        );
        cy.contains('label', 'Holding bridges').find('input').uncheck();
        save();
        expectTabs(1, 0);
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            for (let i = 0; i < 50; i++) {
                const saved = await new ProjectAutosaveStore().load();
                if (
                    saved?.snapshot.stack[0]?.args.tabs?.length === 1 &&
                    saved.snapshot.stack[0].args.laserOptions.bridges === false
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Disabled bridges did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        expectTabs(1, 0);
        editOptions();
        cy.contains('label', 'Holding bridges').find('input').check();
        cy.get('[aria-label="Bridge generation"]').select('automatic');
        save();
        expectTabs(1, 8);
        editOptions();
        cy.get('[aria-label="Bridge generation"]').select('manual');
        cy.get('[aria-label="Laser bridge width"]').scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-bridge-generation', { capture: 'viewport' });
        save();
        expectTabs(1);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
        cy.contains('button', /^Clear Bridges$/).click();
        cy.get('[role="alertdialog"]')
            .contains('button', /^Clear bridges$/)
            .click();
        expectTabs(0);
        cy.contains('button', /^Auto Bridges$/).click();
        expectTabs(4);
    });
});
