function passLengths(program) {
    const lengths = [];
    let pass = -1,
        x = 0,
        y = 0;
    for (const line of program.split('\n')) {
        const marker = line.match(/^\(Laser pass (\d+)\)/);
        if (marker) {
            pass = Number(marker[1]) - 1;
            lengths[pass] = 0;
        }
        if (!/^G[01] /.test(line)) continue;
        const nextX = Number(line.match(/ X([-\d.]+)/)?.[1] ?? x),
            nextY = Number(line.match(/ Y([-\d.]+)/)?.[1] ?? y);
        if (pass >= 0 && line.startsWith('G1 '))
            lengths[pass] += Math.hypot(nextX - x, nextY - y);
        x = nextX;
        y = nextY;
    }
    return lengths;
}
describe('Laser final-pass overcut', () => {
    it('rejects an excessive overlap and preserves final-pass output through reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser passes"]').type('{selectall}3').blur();
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Laser overcut"]').type('{selectall}99').blur();
        cy.contains('Laser overcut exceeds this outline perimeter')
            .scrollIntoView()
            .should('be.visible');
        cy.get('[aria-label="Laser overcut"]').type('{selectall}2.5').blur();
        cy.contains('button', /^Add Toolpath/)
            .should('be.enabled')
            .click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions).to.include({
                overcut: 2.5,
                passes: 3,
            });
            expect(p.stack[0].toolpath.laserPaths[0].points).to.have.length(5);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((program) => {
            exported = program;
            expect(passLengths(program)).to.deep.equal([80, 80, 82.5]);
            expect(program.match(/G0 X/g)).to.have.length(3);
            expect(program).not.to.match(/M6|G[01] Z/);
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.get('[aria-label="Laser overcut"]')
            .should('have.value', '2.5')
            .scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-overcut-controls', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions?.overcut === 2.5
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Overcut settings did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) =>
            expect(p.stack[0].args.laserOptions.overcut).to.equal(2.5),
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((program) =>
            expect(program).to.equal(exported),
        );
    });
});
