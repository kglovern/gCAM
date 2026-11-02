const rect = (id, x, y, w, h, groupId) => ({
    id,
    ...(groupId ? { groupId } : {}),
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const load = (snapshot) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'Arrange artwork',
                    snapshot,
                }),
            ),
            fileName: 'arrange.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
const base = () => ({
    loops: [
        rect('outer', 100, 100, 30, 30, 'ring'),
        rect('hole', 110, 110, 10, 10, 'ring'),
        rect('b', 180, 160, 20, 20),
        rect('anchor', 250, 200, 10, 10),
    ],
    selected: ['outer', 'b', 'anchor'],
    hidden: [],
    stack: [],
    bitmaps: [],
    guides: [],
    fileName: 'Arrange artwork',
});
const open = () => {
    cy.menu('Modify', 'Arrange…');
    cy.contains('2 of 3 shapes or groups will move', { timeout: 30000 }).should(
        'be.visible',
    );
};
function luminance(x, y) {
    return cy.get('[data-testid="gcam-canvas"]').then(($c) => {
        const c = $c[0],
            camera = JSON.parse(c.dataset.camera),
            data = c
                .getContext('2d')
                .getImageData(
                    Math.round(camera.tx + x * camera.scale),
                    Math.round(camera.ty - y * camera.scale),
                    1,
                    1,
                ).data;
        return (data[0] + data[1] + data[2]) / 3;
    });
}
function assertProposedOutline() {
    cy.get('[data-testid="gcam-canvas"]').should(($c) => {
        const c = $c[0],
            camera = JSON.parse(c.dataset.camera);
        const x = Math.round(camera.tx + 250 * camera.scale) - 2,
            y = Math.round(camera.ty - 125 * camera.scale),
            height = Math.round(20 * camera.scale);
        const pixels = c.getContext('2d').getImageData(x, y, 5, height).data;
        let red = 0;
        for (let i = 0; i < pixels.length; i += 4)
            if (
                pixels[i] > 160 &&
                pixels[i + 1] < 150 &&
                pixels[i + 2] < 150 &&
                pixels[i] > pixels[i + 1] * 1.4
            )
                red++;
        expect(
            red,
            'proposed outline at its new world position',
        ).to.be.greaterThan(5);
    });
}
it('stages alignment/distribution with group holes, targeted job cleanup, history and regenerated export', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    let original, arranged;
    cy.window()
        .then(async (win) => {
            const p = base(),
                { buildToolpathGcodeAsync } = await win.eval(
                    "import('/src/lib/engine.ts')",
                );
            for (const [id, loops] of [
                ['ring-job', p.loops.slice(0, 2)],
                ['b-job', [p.loops[2]]],
                ['anchor-job', [p.loops[3]]],
            ]) {
                const args = {
                    loops,
                    operation: 'laser-cut',
                    toolDiameter: 0.1,
                    cutDepth: 1,
                    laserFeed: 1000,
                    laserPower: 300,
                    laserSpot: 0.1,
                };
                const result = await buildToolpathGcodeAsync(args);
                p.stack.push({
                    id,
                    label: id,
                    customLabel: id,
                    args,
                    toolpath: result.toolpath,
                    preview: result.previewContours.map((points) => ({
                        points,
                    })),
                });
            }
            original = p;
            return p;
        })
        .then(load);
    open();
    cy.contains('2 related toolpaths will be removed').should('be.visible');
    cy.menu('View', 'Zoom Out');
    cy.menu('View', 'Zoom Out');
    assertProposedOutline();
    cy.screenshot('laser-arrange-preview', { capture: 'viewport' });
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(original.loops);
        expect(p.stack).to.have.length(3);
    });
    open();
    cy.contains('button', /^Apply arrangement$/).click();
    cy.snapshot().then((p) => {
        arranged = p;
        expect(p.loops[0].points[0]).to.deep.equal({ x: 250, y: 100 });
        expect(p.loops[1].points[0]).to.deep.equal({ x: 260, y: 110 });
        expect(p.loops[2].points[0]).to.deep.equal({ x: 250, y: 160 });
        expect(p.loops[3]).to.deep.equal(original.loops[3]);
        expect(p.stack.map((j) => j.id)).to.deep.equal(['anchor-job']);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => {
        expect(p.loops).to.deep.equal(original.loops);
        expect(p.stack).to.have.length(3);
    });
    cy.get('[aria-label="Redo"]').click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(arranged.loops));
    cy.menu('Modify', 'Arrange…');
    cy.get('[aria-label="Arrangement action"]').select('spaceY');
    cy.contains('1 of 3 shapes or groups will move', { timeout: 30000 }).should(
        'be.visible',
    );
    cy.contains('button', /^Cancel$/).click();
    cy.snapshot().then((p) => expect(p.loops).to.deep.equal(arranged.loops));
    cy.contains('button', /^Laser Fill$/).click();
    cy.contains('button', /^Change$/).click();
    cy.get('[aria-label="Laser power percent"]').type('{selectall}25').blur();
    cy.get('[aria-label="Laser line interval"]').type('{selectall}1').blur();
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('input[aria-label^="Name Laser Fill"]', { timeout: 30000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        const fill = p.stack.find((j) => j.args.operation === 'laser-fill');
        let entersHole = false;
        for (const row of fill.toolpath.laserPaths)
            for (let i = 1; i < row.points.length; i++) {
                const a = row.points[i - 1],
                    b = row.points[i],
                    x = (a.x + b.x) / 2,
                    y = (a.y + b.y) / 2;
                if (
                    b.power > 0 &&
                    x > 260.001 &&
                    x < 269.999 &&
                    y > 110.001 &&
                    y < 119.999
                )
                    entersHole = true;
            }
        expect(entersHole).to.equal(false);
        load(p);
    });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((code) => {
        expect(code).to.include('S250');
        expect(code).to.include('S300');
    });
});
it('moves rotated image pixels and placement together while retaining the source and Undo', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    let source;
    cy.window().then((win) => {
        const canvas = win.document.createElement('canvas');
        canvas.width = canvas.height = 2;
        canvas.getContext('2d').fillRect(0, 0, 2, 2);
        const bitmap = {
            id: 'image',
            x: 160,
            y: 140,
            w: 20,
            h: 10,
            rotation: 30,
            dataUrl: canvas.toDataURL('image/png'),
        };
        const outline = rect('image-outline', 160, 140, 20, 10);
        outline.bitmapId = 'image';
        outline.points = outline.points.map((p) => ({
            x: 170 + (p.x - 170) * Math.cos(Math.PI / 6) - (p.y - 145) * 0.5,
            y: 145 + (p.x - 170) * 0.5 + (p.y - 145) * Math.cos(Math.PI / 6),
        }));
        source = {
            ...base(),
            loops: [outline, rect('anchor', 100, 100, 10, 10)],
            selected: ['image-outline', 'anchor'],
            bitmaps: [bitmap],
        };
        load(source);
    });
    cy.menu('Modify', 'Arrange…');
    cy.get('[aria-label="Arrangement action"]').select('bottom');
    cy.contains('1 of 2 shapes or groups will move', { timeout: 30000 }).should(
        'be.visible',
    );
    cy.contains('button', /^Apply arrangement$/).click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps[0].x).to.equal(160);
        expect(p.bitmaps[0].y).to.be.closeTo(104.3301270189222, 1e-8);
        expect(p.bitmaps[0].rotation).to.equal(30);
        expect(p.bitmaps[0].dataUrl).to.equal(source.bitmaps[0].dataUrl);
        expect(Math.min(...p.loops[0].points.map((q) => q.y))).to.be.closeTo(
            100,
            1e-8,
        );
    });
    luminance(170, 109.33).should('be.lessThan', 100);
    luminance(170, 145).should('be.greaterThan', 150);
    cy.get('[aria-label="Undo"]').click();
    cy.snapshot().then((p) => {
        expect(p.bitmaps).to.deep.equal(source.bitmaps);
        expect(p.loops).to.deep.equal(source.loops);
    });
});
it('keeps hidden group members together and rejects stale arrangement after drawing edits', () => {
    cy.freshProject({ tools: false });
    cy.get('[aria-label="Laser"]').click();
    const p = { ...base(), hidden: ['hole'] };
    load(p);
    open();
    cy.contains('button', /^Apply arrangement$/).click();
    cy.snapshot().then((saved) => {
        expect(saved.loops[1].points[0]).to.deep.equal({ x: 260, y: 110 });
        expect(saved.hidden).to.deep.equal(['hole']);
    });
    cy.menu('Modify', 'Arrange…');
    cy.get('[aria-label="Arrangement action"]').select('packX');
    cy.contains('2 of 3 shapes or groups will move', { timeout: 30000 }).should(
        'be.visible',
    );
    cy.get('[data-testid="gcam-canvas"]')
        .focus()
        .trigger('keydown', { key: 'ArrowRight' });
    cy.contains('button', /^Apply arrangement$/).click();
    cy.contains('[role="alert"]', 'Source shapes changed').should('be.visible');
});
