const canvas = '[data-testid="gcam-canvas"]';
function luminance(x, y) {
    return cy.get(canvas).then(($c) => {
        const c = $c[0],
            cam = JSON.parse(c.dataset.camera),
            p = c
                .getContext('2d')
                .getImageData(
                    Math.round(cam.tx + x * cam.scale),
                    Math.round(cam.ty - y * cam.scale),
                    1,
                    1,
                ).data;
        return (p[0] + p[1] + p[2]) / 3;
    });
}
function openProject(p, name) {
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    fileName: name,
                    snapshot: p,
                }),
            ),
            fileName: name + '.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.contains('Loaded ' + name + '.gcam.json.').should('exist');
}
function configure() {
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}50').blur();
}
it('links source edits to canvas/raster, preserves Milling, reloads and blocks stale or missing mask output', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false, multipleSelection: false });
    cy.get('[aria-label="Laser"]').click();
    cy.window().then((win) => {
        const c = win.document.createElement('canvas');
        c.width = c.height = 32;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, 32, 32);
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    c.toDataURL('image/png').split(',')[1],
                    'base64',
                ),
                fileName: 'linked-mask.png',
                mimeType: 'image/png',
            },
            { force: true },
        );
    });
    cy.contains('button', 'Engrave image').click();
    cy.menu('Draw', 'Rectangle');
    cy.worldClick(30, 30);
    cy.worldClick(70, 70);
    cy.get('[aria-label="Select shapes"]').click();
    cy.get('[aria-label="Select layer Default"]').click();
    cy.contains('button', /^Laser Raster$/).click();
    cy.contains('button', 'Link selected shapes as mask').click();
    cy.contains('Linked to 1 shape.').should('exist');
    luminance(25, 50).should('be.greaterThan', 150);
    luminance(50, 50).should('be.lessThan', 150);
    cy.get('[aria-label="Milling"]').click();
    luminance(25, 50).should('be.lessThan', 100);
    cy.get('[aria-label="Laser"]').click();
    luminance(25, 50).should('be.greaterThan', 150);
    cy.contains('button', /^Laser Raster$/).click();
    configure();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    let original, sourceId, moved, saved, portableFile;
    cy.snapshot().then((p) => {
        original = p;
        sourceId = p.bitmaps[0].maskSourceIds[0];
        expect(p.stack[0].args.laserOptions.maskSourceIds).to.deep.equal([
            sourceId,
        ]);
    });
    cy.get('[aria-label="Select shapes"]').click();
    cy.worldClick(30, 50);
    cy.snapshot().then((p) => expect(p.selected).to.deep.equal([sourceId]));
    cy.get('body').type('{rightarrow}');
    cy.snapshot().then((p) => {
        moved = p.loops.find((l) => l.id === sourceId);
        expect(Math.min(...moved.points.map((p) => p.x))).to.be.greaterThan(30);
        expect(p.bitmaps[0].maskSourceIds).to.deep.equal([sourceId]);
        expect(p.stack).to.have.length(0);
    });
    cy.get('[aria-label="Select layer Default"]').click();
    cy.contains('button', /^Laser Raster$/).click();
    configure();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        saved = p;
        const image = p.bitmaps[0],
            minX = Math.min(...moved.points.map((p) => p.x)),
            maxX = Math.max(...moved.points.map((p) => p.x));
        expect(p.stack[0].args.laserOptions.imageMask[0][0].x).to.be.closeTo(
            (moved.points[0].x - image.x) / image.w,
            1e-10,
        );
        for (const { points } of p.stack[0].toolpath.laserPaths)
            for (let i = 1; i < points.length; i++)
                if (points[i].power > 0)
                    for (const point of [points[i - 1], points[i]])
                        expect(point.x).to.be.within(minX - 1e-6, maxX + 1e-6);
    });
    cy.readDownload('.gcam.json').then((raw) => {
        expect(JSON.parse(raw).version).to.equal(4);
        portableFile = raw;
    });
    cy.screenshot('laser-live-mask', { capture: 'viewport' });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(portableFile),
                fileName: 'linked-v4.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded linked-v4.gcam.json.').should('exist');
    cy.get('[aria-label="Laser"]').click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
        'be.enabled',
    );
    cy.then(() =>
        openProject(
            {
                ...saved,
                loops: saved.loops.map((l) =>
                    l.id === sourceId
                        ? {
                              ...l,
                              points: l.points.map((p) => ({
                                  x: p.x + 5,
                                  y: p.y,
                              })),
                          }
                        : l,
                ),
            },
            'Stale mask',
        ),
    );
    cy.contains(/Linked mask changed.*Regenerate/, { timeout: 30000 }).should(
        'exist',
    );
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
        'be.disabled',
    );
    cy.screenshot('laser-stale-mask-blocked', { capture: 'viewport' });
    cy.task('clearDownloads');
    cy.get('[aria-label="Export individual toolpaths"]').click();
    cy.contains('button', /^1\. Laser Raster/).click();
    cy.get('[aria-label="Export individual toolpaths"]').should(
        'have.attr',
        'aria-expanded',
        'false',
    );
    cy.contains(/Linked mask changed.*Regenerate/).should('exist');
    cy.task('download', '.gcode').should('be.null');

    cy.then(() =>
        openProject(
            { ...saved, loops: saved.loops.filter((l) => l.id !== sourceId) },
            'Missing mask',
        ),
    );
    cy.contains(/Linked mask shape is missing/).should('exist');
    cy.get('button[aria-label^="Edit Laser Raster"]').click();
    cy.contains('button', 'Remove mask').should('be.enabled').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].maskSourceIds ?? []).to.deep.equal([]);
        expect(p.stack).to.have.length(0);
        expect(p.bitmaps[0].dataUrl).to.equal(original.bitmaps[0].dataUrl);
    });
});
