describe('Laser power control', () => {
    it('exports constant then speed-adjusted operations and retains modes after reload', () => {
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
        cy.get('[aria-label="Laser power control"]').select('constant');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]')
            .should('exist')
            .then((input) => {
                const label = input.val();
                cy.get(`[aria-label="Duplicate ${label}"]`).click();
                cy.get(`[aria-label="Edit ${label} copy"]`).click();
            });
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.get('[aria-label="Laser power control"]')
            .should('have.value', 'constant')
            .select('dynamic')
            .scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-power-control', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        const verify = (p) => {
            expect(p.stack).to.have.length(2);
            expect(
                p.stack.map((e) => e.toolpath.laserOptions.powerMode),
            ).to.deep.equal(['constant', 'dynamic']);
        };
        cy.snapshot().then(verify);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code.match(/M[34] S0/g)).to.deep.equal(['M3 S0', 'M4 S0']);
            expect(code.match(/M5/g)).to.have.length(2);
            expect(code).to.include('S400');
            expect(code).not.to.match(/\$32|\$30/);
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack.length === 2 &&
                    saved.snapshot.stack[1].args.laserOptions?.powerMode ===
                        'dynamic'
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Power modes did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then(verify);
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
