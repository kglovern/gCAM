const rect = (id, x, y, w, h, groupId) => ({
    id,
    groupId,
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const coverage = (paths) =>
    paths
        .flatMap((path) =>
            path.points
                .slice(1)
                .flatMap((end, index) =>
                    end.power > 0
                        ? [
                              JSON.stringify([
                                  path.points[index].x,
                                  path.points[index].y,
                                  end.x,
                                  end.y,
                                  end.power,
                              ]),
                          ]
                        : [],
                ),
        )
        .sort();
const assertSequence = (paths) => {
    const owners = paths.map((path) =>
            path.points.some((p) => p.x < 160) ? 'A' : 'B',
        ),
        split = owners.indexOf('B');
    expect(split).to.be.greaterThan(0);
    expect(owners.slice(0, split).every((o) => o === 'A')).to.equal(true);
    expect(owners.slice(split).every((o) => o === 'B')).to.equal(true);
};
it('fills artwork groups through the real worker and preserves coverage/history/settings/export/reload', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    const loops = [
        rect('a1', 100, 100, 12, 12, 'A'),
        rect('b1', 180, 100, 12, 12, 'B'),
        rect('a2', 125, 100, 12, 12, 'A'),
        rect('hole', 103, 103, 6, 6, 'A'),
        rect('island', 105, 105, 2, 2, 'A'),
        rect('b2', 205, 100, 12, 12, 'B'),
    ];
    const snapshot = {
        loops,
        selected: loops.map((l) => l.id),
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'Grouped fill',
        stock: {
            widthMm: 300,
            heightMm: 200,
            thicknessMm: 3,
            material: 'sheet-goods',
            laserMaterial: 'plywood',
            origin: 'front-left',
        },
    };
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({ kind: 'gcam.project', version: 2, snapshot }),
            ),
            fileName: 'groups.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.contains('button', /^Laser Fill$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}40').blur();
    cy.get('[aria-label="Laser line interval"]').type('{selectall}1').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Fill"]', { timeout: 30000 }).should(
        'exist',
    );
    let allCoverage, raw;
    cy.snapshot().then((p) => {
        allCoverage = coverage(p.stack[0].toolpath.laserPaths);
    });
    cy.get('input[aria-label^="Name Laser Fill"]').then((input) =>
        cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
    );
    cy.contains('summary', 'Laser options').click();
    cy.get('[aria-label="Laser fill sequence"]')
        .select('groups')
        .scrollIntoView();
    cy.contains('Calculating toolpath').should('not.exist');
    cy.screenshot('laser-artwork-fill-groups', { capture: 'viewport' });
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
    cy.snapshot().then((p) => {
        const job = p.stack[0];
        expect(job.args.laserOptions.fillSequence).to.equal('groups');
        expect(job.args.loops.map((l) => l.groupId)).to.deep.equal(
            loops.map((l) => l.groupId),
        );
        expect(coverage(job.toolpath.laserPaths)).to.deep.equal(allCoverage);
        assertSequence(job.toolpath.laserPaths);
        expect(p.loops).to.deep.equal(loops);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].toolpath.laserOptions.fillSequence).to.equal('all'),
    );
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].args.laserOptions.fillSequence).to.equal('groups'),
    );
    cy.readDownload('.gcam.json').then((text) => {
        raw = text;
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'grouped-export.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.get('[aria-label="Laser"]').click();
    cy.snapshot().then((p) => {
        assertSequence(p.stack[0].toolpath.laserPaths);
        expect(coverage(p.stack[0].toolpath.laserPaths)).to.deep.equal(
            allCoverage,
        );
    });
    cy.get('input[aria-label^="Name Laser Fill"]').then((input) =>
        cy.get(`[aria-label="Edit ${input.val()}"]`).click(),
    );
    cy.contains('summary', 'Laser options').click();
    cy.get('[aria-label="Laser fill sequence"]').should('have.value', 'groups');
    cy.contains('button', /^Save Toolpath$/).click();
    cy.contains('button', /^Cancel Edit$/).should('not.exist');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S400');
        expect(code).not.to.match(/M6|G[01] Z/);
    });
});
