describe('Laser shared cuts', () => {
    it('cuts a shared edge once per pass and reloads identical output', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-shared.svg');
        cy.worldClick(0, 5);
        cy.worldClick(20, 5, { ctrlKey: true });
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser passes"]').type('{selectall}2').blur();
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Remove shared cuts"]').check();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) => {
            const tp = p.stack[0].toolpath;
            expect(tp.laserOptions.removeSharedCuts).to.equal(true);
            let on = 0,
                off = 0;
            for (const path of tp.laserPaths)
                for (let i = 1; i < path.points.length; i++) {
                    const a = path.points[i - 1],
                        b = path.points[i];
                    const d = Math.hypot(b.x - a.x, b.y - a.y);
                    if (b.power > 0) on += d;
                    else off += d;
                }
            expect(on).to.be.closeTo(70, 1e-7);
            expect(off).to.be.closeTo(10, 1e-7);
        });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code.match(/Laser pass/g)).to.have.length(2);
            expect(code).to.include('S0');
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.get('[aria-label="Remove shared cuts"]')
            .should('be.checked')
            .scrollIntoView();
        cy.screenshot('laser-shared-cuts', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.contains('button', /^Cancel Edit$/).should('not.exist');
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.toolpath?.laserOptions
                        ?.removeSharedCuts
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Shared-cut autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
