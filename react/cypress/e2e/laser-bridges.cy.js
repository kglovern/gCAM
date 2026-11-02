describe('Laser holding bridges', () => {
    it('previews beam-off gaps and preserves repeated output through project reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser passes"]').type('{selectall}2').blur();
        cy.contains('summary', 'Laser options').click();
        cy.contains('label', 'Holding bridges').find('input').check();
        cy.get('[aria-label="Laser bridge width"]').type('{selectall}2').blur();
        cy.get('[aria-label="Bridges per shape"]').should('have.value', '4');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        let paths, exported;
        cy.snapshot().then((p) => {
            expect(p.stack).to.have.length(1);
            expect(p.stack[0].args.laserOptions).to.include({
                bridges: true,
                bridgeWidth: 2,
            });
            expect(p.stack[0].toolpath.laserOptions.bridgeCount).to.equal(4);
            paths = p.stack[0].toolpath.laserPaths;
            const offLength = paths.reduce(
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
            expect(offLength).to.be.closeTo(8, 0.00001);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S400');
            expect(code.match(/G1 [^\n]*[XY][^\n]*S0/g)).to.have.length(8);
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) => {
            cy.get(`[aria-label="Edit ${input.val()}"]`).click();
        });
        cy.contains('summary', 'Laser options').then((summary) => {
            if (!summary.parent().prop('open')) cy.wrap(summary).click();
        });
        cy.get('[aria-label="Laser bridge width"]').should('have.value', '2');
        cy.get('[aria-label="Laser bridge width"]').scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-holding-bridges-controls', {
            capture: 'viewport',
        });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (saved?.snapshot.stack[0]?.args.laserOptions?.bridges)
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Bridge settings did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) =>
            expect(p.stack[0].toolpath.laserPaths).to.deep.equal(paths),
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
    it('generates spacing-based gaps and retains a user maximum through reload', () => {
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
        cy.contains('label', 'Holding bridges').find('input').check();
        cy.get('[aria-label="Bridge placement"]').select('spacing');
        cy.get('[aria-label="Laser bridge spacing"]')
            .type('{selectall}15')
            .blur();
        cy.get('[aria-label="Laser bridge width"]').type('{selectall}2').blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        cy.snapshot().then((p) => {
            const path = p.stack[0].toolpath.laserPaths[0];
            const off = path.points
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
                );
            expect(off).to.be.closeTo(12, 0.00001);
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.contains('label', 'Limit maximum').find('input').check();
        cy.get('[aria-label="Maximum laser bridges"]')
            .type('{selectall}3')
            .blur()
            .scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-bridge-spacing-controls', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions?.bridgeMax === 3
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Spacing settings did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions).to.include({
                bridgePlacement: 'spacing',
                bridgeSpacing: 15,
                bridgeLimit: true,
                bridgeMax: 3,
            });
            const path = p.stack[0].toolpath.laserPaths[0];
            const off = path.points
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
                );
            expect(off).to.be.closeTo(6, 0.00001);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
