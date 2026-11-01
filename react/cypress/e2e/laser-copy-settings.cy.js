describe('Laser operation settings transfer', () => {
    it('copies settings to another image while preserving source operation and target crop', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('laser-image-modes.png');
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser feed"]').type('{selectall}1500').blur();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}35')
            .blur();
        cy.contains('label', 'Resolution (DPI)')
            .find('input')
            .type('{selectall}127')
            .blur();
        cy.contains('label', 'Gamma')
            .find('input')
            .type('{selectall}1.4')
            .blur();
        cy.contains('label', 'Brightness')
            .find('input')
            .type('{selectall}0.2')
            .blur();
        cy.contains('label', 'Image mode').find('select').select('jarvis');
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}50')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        let original;
        cy.snapshot().then((p) => {
            original = p.stack[0];
        });
        cy.importDesign('contrast.png');
        cy.contains('button', 'Engrave image').click();
        cy.get('[aria-label="Crop left percent"]').type('{selectall}25').blur();
        cy.get('[aria-label="Crop right percent"]')
            .type('{selectall}75')
            .blur();
        cy.contains('summary', 'Copy operation settings').click();
        cy.get('[aria-label="Copy laser settings from"] option').should(
            'have.length',
            2,
        );
        cy.get('[aria-label="Copy laser settings from"]').select(1);
        cy.contains('button', 'Apply settings').click();
        cy.get('[aria-label="Laser feed"]').should('have.value', '1500');
        cy.get('[aria-label="Laser power percent"]').should('have.value', '35');
        cy.contains('label', 'Gamma').find('input').should('have.value', '1.4');
        cy.contains('label', 'Image mode')
            .find('select')
            .should('have.value', 'jarvis');
        cy.get('[aria-label="Crop left percent"]').should('have.value', '25');
        cy.get('[aria-label="Crop right percent"]').should('have.value', '75');
        cy.contains('summary', 'Copy operation settings').scrollIntoView();
        cy.screenshot('laser-copy-operation-settings', { capture: 'viewport' });
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        const verify = (p) => {
            expect(p.stack).to.have.length(2);
            expect(p.bitmaps).to.have.length(2);
            expect(p.stack[0]).to.deep.equal(original);
            expect(p.stack[1].args.laserOptions).to.include({
                imageMode: 'jarvis',
                brightness: 0.2,
            });
            expect(p.stack[1].args.laserOptions.imageCrop).to.deep.equal({
                left: 0.25,
                bottom: 0,
                right: 0.75,
                top: 1,
            });
            expect(p.stack[1].args.laserFeed).to.equal(1500);
            expect(p.stack[1].args.laserSMax).to.equal(350);
            expect(p.stack[1].args.loops[0].bitmapId).not.to.equal(
                p.stack[0].args.loops[0].bitmapId,
            );
        };
        cy.snapshot().then(verify);
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let attempt = 0; attempt < 50; attempt++) {
                const saved = await store.load();
                if (saved?.snapshot.stack.length === 2) return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Transferred settings were not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then(verify);
    });
});
