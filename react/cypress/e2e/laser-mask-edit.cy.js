function luminance(x, y) {
    return cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
        const c = $canvas[0],
            camera = JSON.parse(c.dataset.camera),
            pixel = c
                .getContext('2d')
                .getImageData(
                    Math.round(camera.tx + x * camera.scale),
                    Math.round(camera.ty - y * camera.scale),
                    1,
                    1,
                ).data;
        return (pixel[0] + pixel[1] + pixel[2]) / 3;
    });
}
it('masks lettering on canvas, preserves holes, edits image independently and releases without losing pixels', () => {
    cy.viewport(1280, 850);
    cy.freshProject({ tools: false, multipleSelection: false });
    cy.get('[aria-label="Laser"]').click();
    cy.importDesign('mask-lettering.svg');
    cy.menu('View', 'Snap to Grid');
    cy.window().then((win) => {
        const c = win.document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        for (let y = 0; y < 128; y++) {
            const value = Math.round(75 + 40 * Math.sin(y * 0.3));
            ctx.fillStyle =
                'rgb(' + (value + 40) + ',' + value + ',' + value / 2 + ')';
            ctx.fillRect(0, y, 128, 1);
        }
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    c.toDataURL('image/png').split(',')[1],
                    'base64',
                ),
                fileName: 'sign-texture.png',
                mimeType: 'image/png',
            },
            { force: true },
        );
    });
    cy.contains(/Bitmap .+ placed/).should('exist');
    cy.get('[aria-label="Select shapes"]').click();
    cy.get('[aria-label="Select layer Default"]').click();
    cy.menu('Edit', 'Mask image to shapes');
    cy.get('[role="dialog"][aria-label="Edit image mask"]').should('not.exist');
    luminance(60, 37).should('be.lessThan', 180);
    luminance(58, 45).should('be.greaterThan', 200);
    luminance(87, 37).should('be.greaterThan', 200);
    luminance(40, 37).should('be.greaterThan', 200);
    let initial, moved, saved;
    cy.snapshot().then((p) => {
        initial = p;
        expect(p.bitmaps[0].maskSourceIds).to.have.length(5);
        expect(p.selected).to.have.length(1);
    });
    cy.menu('Edit', 'Edit image inside mask');
    cy.worldDrag([50, 30], [55, 33]);
    cy.snapshot().then((p) => {
        moved = p;
        expect(p.bitmaps[0].x).to.be.closeTo(initial.bitmaps[0].x + 5, 0.1);
        expect(p.bitmaps[0].y).to.be.closeTo(initial.bitmaps[0].y + 3, 0.1);
        expect(p.bitmaps[0].dataUrl).to.equal(initial.bitmaps[0].dataUrl);
        for (const id of p.bitmaps[0].maskSourceIds)
            expect(p.loops.find((l) => l.id === id).points).to.deep.equal(
                initial.loops.find((l) => l.id === id).points,
            );
    });
    cy.menu('Edit', 'Edit mask shapes');
    cy.worldDrag([60, 37], [62, 38]);
    cy.snapshot().then((p) => {
        const ids = p.bitmaps[0].maskSourceIds;
        expect(p.selected).to.deep.equal(ids);
        expect(p.bitmaps).to.deep.equal(moved.bitmaps);
        const dx =
            p.loops.find((l) => l.id === ids[0]).points[0].x -
            moved.loops.find((l) => l.id === ids[0]).points[0].x;
        expect(dx).to.be.greaterThan(0);
        for (const id of ids)
            expect(p.loops.find((l) => l.id === id).points[0].x).to.be.closeTo(
                moved.loops.find((l) => l.id === id).points[0].x + dx,
                1e-8,
            );
    });
    cy.menu('Edit', 'Edit image inside mask');
    cy.get('[aria-label="Select shapes"]').click();
    cy.worldClick(40, 15);
    cy.menu('Edit', 'Release image mask');
    luminance(40, 37).should('be.lessThan', 180);
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].maskSourceIds).to.be.undefined;
        expect(p.bitmaps[0].dataUrl).to.equal(initial.bitmaps[0].dataUrl);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.bitmaps[0].maskSourceIds).to.have.length(5),
    );
    cy.contains('button', /^Laser Raster$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}50').blur();
    cy.get('[aria-label="Resolution (DPI)"]').type('{selectall}50').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        saved = p;
        expect(p.stack[0].args.laserOptions.imageMask).to.have.length(5);
        const sources = p.loops.filter((l) =>
            p.bitmaps[0].maskSourceIds.includes(l.id),
        );
        const holes = sources.filter((l) => {
            const xs = l.points.map((p) => p.x);
            return Math.max(...xs) - Math.min(...xs) < 20;
        });
        expect(holes).to.have.length(3);
        const inside = (point, polygon) => {
            let result = false;
            for (
                let i = 0, j = polygon.length - 1;
                i < polygon.length;
                j = i++
            ) {
                const a = polygon[i],
                    b = polygon[j];
                if (
                    a.y > point.y !== b.y > point.y &&
                    point.x <
                        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
                )
                    result = !result;
            }
            return result;
        };
        let segments = 0;
        for (const path of p.stack[0].toolpath.laserPaths)
            for (let i = 1; i < path.points.length; i++) {
                if (path.points[i].power <= 0) continue;
                const a = path.points[i - 1],
                    b = path.points[i],
                    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                for (const hole of holes)
                    expect(
                        inside(mid, hole.points),
                        'powered cut avoids letter holes',
                    ).to.equal(false);
                segments++;
            }
        expect(segments).to.be.greaterThan(20);
    });
    cy.screenshot('laser-texture-in-lettering', { capture: 'viewport' });
    cy.get('button[aria-label^="Edit Laser Raster"]').click();
    cy.menu('Edit', 'Release image mask');
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Raster"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].maskSourceIds).to.be.undefined;
        expect(p.stack[0].args.laserOptions.imageMask ?? []).to.have.length(0);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) =>
        expect(p.stack[0].args.laserOptions.imageMask).to.deep.equal(
            saved.stack[0].args.laserOptions.imageMask,
        ),
    );
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.match(/S[1-9]\d*/);
        expect(code).not.to.match(/NaN|Infinity|undefined|M6|G[01] Z/);
    });
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].maskSourceIds).to.deep.equal(
            saved.bitmaps[0].maskSourceIds,
        );
        expect(p.stack[0].args.laserOptions.imageMask).to.deep.equal(
            saved.stack[0].args.laserOptions.imageMask,
        );
    });
});
