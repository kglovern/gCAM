describe('Laser fill sequence', () => {
    it('fills separate shapes in turn, preserves coverage and reloads settings', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.worldClick(70, 50, { ctrlKey: true });
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
        let original;
        const coverage = (paths) =>
            paths
                .map((path) =>
                    path.points
                        .map((p) =>
                            [p.x.toFixed(6), p.y.toFixed(6), p.power].join(','),
                        )
                        .sort()
                        .join(':'),
                )
                .sort();
        const travel = (paths) => {
            let distance = 0,
                previous = { x: 0, y: 0 };
            for (const path of paths) {
                distance += Math.hypot(
                    path.points[0].x - previous.x,
                    path.points[0].y - previous.y,
                );
                previous = path.points[path.points.length - 1];
            }
            return distance;
        };
        cy.snapshot().then((p) => {
            original = p.stack[0].toolpath.laserPaths;
        });
        cy.get('input[aria-label^="Name Laser Fill"]').then((input) =>
            cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
        );
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Laser fill sequence"]')
            .select('individual')
            .scrollIntoView();
        cy.contains('Calculating toolpath').should('not.exist');
        cy.screenshot('laser-fill-sequence', { capture: 'viewport' });
        cy.contains('button', /^Save Toolpath$/).click();
        cy.contains('button', /^Cancel Edit$/).should('not.exist');
        cy.snapshot().then((p) => {
            const tp = p.stack[0].toolpath;
            expect(tp.laserOptions.fillSequence).to.equal('individual');
            expect(coverage(tp.laserPaths)).to.deep.equal(coverage(original));
            expect(travel(tp.laserPaths)).to.be.lessThan(travel(original));
        });
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const saved = await store.load();
                if (
                    saved?.snapshot.stack[0]?.toolpath?.laserOptions
                        ?.fillSequence === 'individual'
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Fill sequence autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) =>
            expect(p.stack[0].toolpath.laserOptions.fillSequence).to.equal(
                'individual',
            ),
        );
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S400');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
});
