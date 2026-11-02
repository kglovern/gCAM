describe('Laser perforation', () => {
    it('retains physical cut/skip lengths, repeated output and settings after reload', () => {
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
        cy.contains('label', 'Perforation').find('input').check();
        cy.get('[aria-label="Perforation cut length"]')
            .type('{selectall}3')
            .blur();
        cy.get('[aria-label="Perforation skip length"]')
            .type('{selectall}2')
            .blur();
        cy.contains('label', 'Perforation').find('input').uncheck();
        cy.get('[aria-label="Perforation cut length"]').should('not.exist');
        cy.contains('label', 'Perforation').find('input').check();
        cy.get('[aria-label="Perforation cut length"]').should(
            'have.value',
            '3',
        );
        cy.get('[aria-label="Perforation skip length"]').should(
            'have.value',
            '2',
        );
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').should('exist');
        let paths, exported;
        const verify = (p) => {
            const path = p.stack[0].toolpath;
            expect(path.laserOptions).to.include({
                perforation: true,
                perforationCut: 3,
                perforationSkip: 2,
                passes: 2,
            });
            const lengths = path.laserPaths[0].points.slice(1).reduce(
                (sum, b, i) => {
                    const a = path.laserPaths[0].points[i];
                    sum[b.power === 0 ? 'off' : 'on'] += Math.hypot(
                        b.x - a.x,
                        b.y - a.y,
                    );
                    return sum;
                },
                { on: 0, off: 0 },
            );
            expect(lengths.on).to.be.closeTo(48, 0.00001);
            expect(lengths.off).to.be.closeTo(32, 0.00001);
        };
        cy.snapshot().then((p) => {
            verify(p);
            paths = p.stack[0].toolpath.laserPaths;
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            exported = code;
            expect(code).to.include('S400');
            expect(code.match(/G1 [^\n]*[XY][^\n]*S0/g)).to.have.length(32);
            expect(code.match(/Laser pass/g)).to.have.length(2);
            expect(code).not.to.match(/M6|G[01] Z/);
        });
        cy.get('input[aria-label^="Name Laser Cut"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').then((s) => {
            if (!s.parent().prop('open')) cy.wrap(s).click();
        });
        cy.get('[aria-label="Perforation skip length"]').scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-perforation-controls', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions
                        ?.perforationSkip === 2
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Perforation settings did not autosave');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.snapshot().then((p) => {
            verify(p);
            expect(p.stack[0].toolpath.laserPaths).to.deep.equal(paths);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).to.equal(exported),
        );
    });
});
