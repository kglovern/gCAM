const rect = (id, x, y, w, h) => ({
    id,
    groupId: 'part',
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});
const load = (p) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'V-carve clearing',
                    snapshot: p,
                }),
            ),
            fileName: 'vcarve-clearing.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
const depth = (value) =>
    cy.get('[aria-label="Cut depth (mm)"]').type(`{selectall}${value}`).blur();
const save = () =>
    cy
        .contains('button', /^Save Toolpath$/)
        .should('be.enabled')
        .click();
function checkFinishing(finish) {
    const edgeDistance = (p) => {
        let distance = Infinity;
        for (const loop of finish.args.loops)
            for (let i = 1; i < loop.points.length; i++) {
                const a = loop.points[i - 1],
                    b = loop.points[i],
                    dx = b.x - a.x,
                    dy = b.y - a.y;
                const t = Math.max(
                    0,
                    Math.min(
                        1,
                        ((p.x - a.x) * dx + (p.y - a.y) * dy) /
                            (dx * dx + dy * dy || 1),
                    ),
                );
                distance = Math.min(
                    distance,
                    Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy),
                );
            }
        return distance;
    };
    const radius =
        finish.args.cutDepth *
        Math.tan((finish.args.cutterAngle * Math.PI) / 360);
    for (const path of finish.toolpath.motionPaths)
        for (let i = 1; i < path.points.length; i++) {
            const a = path.points[i - 1],
                b = path.points[i];
            for (const t of [0, 0.5, 1])
                expect(
                    edgeDistance({
                        x: a.x + t * (b.x - a.x),
                        y: a.y + t * (b.y - a.y),
                    }),
                    'V-bit stays out of cleared corridor centre',
                ).to.be.at.most(radius + 0.03);
        }
}
it('creates, edits and persists a clearing/finishing pair with the bevel and island protected', () => {
    cy.freshProject();
    cy.viewport(1280, 720);
    load({
        loops: [rect('outer', 20, 20, 80, 60), rect('hole', 50, 40, 20, 20)],
        selected: ['outer'],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        stock: {
            widthMm: 140,
            heightMm: 100,
            thicknessMm: 18,
            material: 'plywood-mdf',
            origin: 'front-left',
        },
    });
    cy.contains('Loaded vcarve-clearing.gcam.json.').should('be.visible');
    cy.contains('button', /^V-Carve$/).click();
    cy.get('button[aria-label="Tool library slot"]').click();
    cy.contains('[role="option"]', 'Test v-bit').click();
    depth(3);
    cy.contains('label', 'Add clearing toolpath').find('input').check();
    cy.get('[aria-label="Clearing endmill"]').select('1');
    cy.contains('Preview: Calculating toolpath').should('not.exist');
    cy.screenshot('vcarve-clearing-form', { capture: 'viewport' });
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('[aria-label^="Edit V-carve clearing"]', { timeout: 60000 }).should(
        'exist',
    );
    let original, raw;
    cy.snapshot().then((p) => {
        original = p;
        expect(p.stack).to.have.length(2);
        const [clear, finish] = p.stack;
        checkFinishing(finish);
        expect(clear.args.operation).to.equal('pocket');
        expect(finish.args.operation).to.equal('vcarve');
        expect(clear.args.vCarvePairId).to.equal(finish.args.vCarvePairId);
        expect(clear.args.toolNumber).to.equal(1);
        expect(finish.args.toolNumber).to.equal(3);
        const inset = 3 * Math.tan(Math.PI / 6);
        expect(
            Math.min(...clear.toolpath.previewContours.flat().map((v) => v.x)),
        ).to.be.closeTo(20 + inset + 3.175 / 2, 0.002);
        expect(finish.toolpath.vCarveEdgeFinish).to.equal(true);
        expect(
            finish.toolpath.motionPaths.some(
                (path) =>
                    path.points.length > 4 &&
                    path.points.every((v) => Math.abs(v.z + 3) < 1e-6),
            ),
        ).to.equal(true);
    });
    cy.get('[aria-label="Undo"]').click();
    cy.get('[aria-label^="Edit V-carve clearing"]').should('not.exist');
    cy.get('[aria-label="Redo"]').click();
    cy.get('[aria-label^="Edit V-carve clearing"]').click();
    cy.get('[aria-label="Cut depth (mm)"]')
        .should('be.disabled')
        .and('have.value', '3');
    save();
    cy.get('[aria-label^="Edit V-Carve"]').click();
    depth(4);
    save();
    cy.get('[aria-label^="Edit V-carve clearing"]', { timeout: 60000 }).should(
        'exist',
    );
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(2);
        expect(p.stack.map((s) => s.id)).to.deep.equal(
            original.stack.map((s) => s.id),
        );
        expect(p.stack[0].args.cutDepth).to.equal(4);
        expect(p.stack[0].args.vCarveInset.depth).to.equal(4);
        expect(p.stack[1].args.cutDepth).to.equal(4);
        checkFinishing(p.stack[1]);
        expect(
            Math.min(
                ...p.stack[0].toolpath.previewContours.flat().map((v) => v.x),
            ),
        ).to.be.closeTo(20 + 4 * Math.tan(Math.PI / 6) + 3.175 / 2, 0.002);
    });
    cy.readDownload('.gcam.json').then((r) => {
        raw = r;
        cy.writeFile('../outputs/vcarve-clearing.gcam.json', r);
    });
    cy.contains('button', /^Fit$/).click();
    cy.get('[aria-label="Cut depths"]', { timeout: 30000 })
        .should('not.contain', 'Calculating')
        .and('not.contain', 'unavailable');
    cy.get('[aria-label^="Edit V-carve clearing"]')
        .closest('.animate-in')
        .should('have.css', 'opacity', '1');
    cy.screenshot('vcarve-clearing-pair', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => {
        expect(code.indexOf('V-carve clearing')).to.be.lessThan(
            code.indexOf('V-Carve -'),
        );
        expect(code).to.contain('Z-4');
        cy.writeFile('../outputs/vcarve-clearing.gcode', code);
    });
    cy.window().then(async (win) => {
        const { deserializeProject } = await win.eval(
            "import('/src/lib/project.ts')",
        );
        const p = deserializeProject(raw);
        return load({
            ...p,
            stack: p.stack.map((e) => ({
                ...e,
                outputEnabled: e.args.operation === 'vcarve',
            })),
        });
    });
    cy.contains('Loaded vcarve-clearing.gcam.json.').should('be.visible');
    cy.contains('button', /^Fit$/).click();
    cy.get('[aria-label="Cut depths"]', { timeout: 30000 })
        .should('not.contain', 'Calculating')
        .and('not.contain', 'unavailable');
    cy.get('[data-testid="gcam-canvas"]').should(($canvas) => {
        const canvas = $canvas[0],
            camera = JSON.parse(canvas.dataset.camera);
        const pixel = canvas
            .getContext('2d')
            .getImageData(
                Math.round(camera.tx + 35.45 * camera.scale),
                Math.round(camera.ty - 50.45 * camera.scale),
                1,
                1,
            ).data;
        expect(
            [...pixel],
            'cleared corridor has no V-bit cutting preview',
        ).to.deep.equal([248, 250, 252, 255]);
    });
    cy.screenshot('vcarve-finishing-only', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((code) => {
        cy.writeFile('../outputs/vcarve-finishing-only.gcode', code);
        cy.window().then(async (win) => {
            const { deserializeProject } = await win.eval(
                "import('/src/lib/project.ts')",
            );
            const finish = deserializeProject(raw).stack.find(
                (e) => e.args.operation === 'vcarve',
            );
            const motionPaths = [];
            let previous = { x: 0, y: 0, z: 0 },
                mode = 0;
            for (const line of code.split(/\r?\n/)) {
                const text = line.replace(/\([^)]*\)/g, '');
                const command = text.match(/\bG0?([01])\b/);
                if (command) mode = Number(command[1]);
                const next = { ...previous };
                let moved = false;
                for (const match of text.matchAll(
                    /\b([XYZ])(-?\d+(?:\.\d+)?)/g,
                )) {
                    next[match[1].toLowerCase()] = Number(match[2]);
                    moved = true;
                }
                if (moved && mode === 1 && Math.min(previous.z, next.z) < 0)
                    motionPaths.push({ points: [previous, next] });
                previous = next;
            }
            expect(motionPaths.length).to.be.greaterThan(5);
            checkFinishing({ ...finish, toolpath: { motionPaths } });
        });
    });
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'vcarve-clearing.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded vcarve-clearing.gcam.json.').should('be.visible');
    cy.get('[aria-label^="Edit V-Carve"]').click();
    cy.contains('label', 'Add clearing toolpath')
        .find('input')
        .should('be.checked');
    cy.get('[aria-label="Clearing endmill"]').should('have.value', '1');
    cy.contains('label', 'Add clearing toolpath').find('input').uncheck();
    save();
    cy.get('[aria-label^="Edit V-carve clearing"]', { timeout: 60000 }).should(
        'not.exist',
    );
    cy.snapshot().then((p) => expect(p.stack).to.have.length(1));
});
