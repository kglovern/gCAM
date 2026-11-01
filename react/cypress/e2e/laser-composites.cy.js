describe('Laser composite fills', () => {
    it('unions overlap and retains a concave hole through CAM, export and reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-composite.svg');
        cy.worldClick(0, 5);
        cy.worldClick(14, 5, { ctrlKey: true });
        cy.worldClick(30, 5, { ctrlKey: true });
        cy.worldClick(30.5, 5, { ctrlKey: true });
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser line interval"]')
            .type('{selectall}1')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        const verify = (p) => {
            expect(p.stack[0].args).to.exist;
            let length = 0;
            for (const path of p.stack[0].toolpath.laserPaths)
                for (let i = 1; i < path.points.length; i++) {
                    const a = path.points[i - 1],
                        b = path.points[i];
                    if (b.power > 0) length += Math.hypot(b.x - a.x, b.y - a.y);
                }
            expect(length).to.be.closeTo(150, 1e-6);
        };
        cy.snapshot().then(verify);
        cy.screenshot('laser-concave-composite-fill', { capture: 'viewport' });
        let exported;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S400');
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                if ((await store.load())?.snapshot.stack.length) return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Composite fill autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then(verify);
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
