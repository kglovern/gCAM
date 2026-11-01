describe('Laser air-assist output configuration', () => {
    it('uses dedicated Config blocks only for enabled operations and retains them after reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Config"]').click();
        cy.contains('summary', 'Customise output').click();
        cy.contains('summary', 'Command blocks').click();
        cy.get('#gcode-laserAirOn')
            .should('have.value', 'M8')
            .clear()
            .type('M7')
            .blur();
        cy.get('#gcode-laserAirOff').should('have.value', 'M9');
        cy.get('#gcode-laserAirOn').scrollIntoView({
            offset: { top: -120, left: 0 },
        });
        cy.screenshot('laser-air-assist-config', { capture: 'viewport' });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('summary', 'Laser options').click();
        cy.contains('label', 'Air assist').find('input').check();
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
        cy.contains('label', 'Air assist')
            .find('input')
            .uncheck()
            .should('not.be.checked');
        cy.contains('button', /^Save Toolpath$/).click();
        cy.contains('button', /^Cancel Edit$/).should('not.exist');
        cy.snapshot().then((p) =>
            expect(
                p.stack.map((e) => e.toolpath.laserOptions.airAssist),
            ).to.deep.equal([true, false]),
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code.match(/^M7$/gm)).to.have.length(1);
            expect(code.match(/^M9$/gm)).to.have.length(1);
            expect(code).not.to.match(/^M8$/m);
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
                    saved.snapshot.stack[1].args.laserOptions?.airAssist ===
                        false
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Air-assist operations did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
        cy.get('[aria-label="Config"]').click();
        cy.contains('summary', 'Customise output').click();
        cy.contains('summary', 'Command blocks').click();
        cy.get('#gcode-laserAirOn').should('have.value', 'M7');
        cy.get('#gcode-laserAirOff').should('have.value', 'M9');
    });
});
