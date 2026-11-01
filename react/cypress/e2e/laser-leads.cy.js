function lengths(code) {
    const values = [];
    let pass = -1,
        x = 0,
        y = 0;
    for (const line of code.split('\n')) {
        const label = line.match(/^\(Laser pass (\d+)\)/);
        if (label) {
            pass = Number(label[1]) - 1;
            values[pass] = 0;
        }
        if (!/^G[01] /.test(line)) continue;
        const nx = Number(line.match(/ X([-\d.]+)/)?.[1] ?? x),
            ny = Number(line.match(/ Y([-\d.]+)/)?.[1] ?? y);
        if (pass >= 0 && line.startsWith('G1 '))
            values[pass] += Math.hypot(nx - x, ny - y);
        x = nx;
        y = ny;
    }
    return values;
}
describe('Straight laser leads', () => {
    it('previews entry/exit and preserves final-overcut exit and physical lengths after reload', () => {
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
        cy.get('[aria-label="Laser overcut"]').type('{selectall}2').blur();
        cy.contains('summary', 'Entry / exit leads').click();
        cy.get('[aria-label="Laser lead in length"]')
            .type('{selectall}2')
            .blur();
        cy.get('[aria-label="Laser lead out length"]')
            .type('{selectall}3')
            .blur();
        cy.get('[aria-label="Laser lead in angle"]').should('have.value', '45');
        cy.contains('button', /^Add Toolpath/)
            .should('be.enabled')
            .click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack[0].args.laserOptions).to.include({
                leadInLength: 2,
                leadOutLength: 3,
                overcut: 2,
                passes: 3,
            });
            expect(p.stack[0].toolpath.laserPaths[0].laserLeadInside).to.equal(
                false,
            );
            expect(p.stack[0].toolpath.previewContours).to.have.length(4);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        let exported;
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            const actual = lengths(code);
            expect(actual).to.have.length(3);
            [85, 85, 87].forEach((expected, i) =>
                expect(actual[i]).to.be.closeTo(expected, 0.001),
            );
            expect(code.match(/G0 X/g)).to.have.length(3);
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.contains('summary', 'Entry / exit leads').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.get('[aria-label="Laser lead out length"]')
            .should('have.value', '3')
            .scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-straight-leads-controls', { capture: 'viewport' });
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
                    saved?.snapshot.stack[0]?.args.laserOptions
                        ?.leadOutLength === 3
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Leads did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
