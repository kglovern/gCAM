import { cutDepthDemo } from '../fixtures/cut-depth-demo';
const load = (p) =>
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'Cut depth samples',
                    snapshot: p,
                }),
            ),
            fileName: 'cut-depth-samples.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
function patch(x, y, kind) {
    cy.get('[data-testid="gcam-canvas"]').should(($c) => {
        const c = $c[0],
            cam = JSON.parse(c.dataset.camera),
            px = Math.round(cam.tx + x * cam.scale),
            py = Math.round(cam.ty - y * cam.scale),
            p = c.getContext('2d').getImageData(px - 2, py - 2, 5, 5).data;
        let count = 0;
        for (let i = 0; i < p.length; i += 4) {
            const grey =
                Math.max(p[i], p[i + 1], p[i + 2]) -
                    Math.min(p[i], p[i + 1], p[i + 2]) <
                45;
            if (
                kind === 'stock'
                    ? p[i] === 248 && p[i + 1] === 250 && p[i + 2] === 252
                    : grey &&
                      p[i] >= 60 &&
                      p[i] < 235 &&
                      p[i + 1] < 240 &&
                      p[i + 2] < 245
            )
                count++;
        }
        expect(count, `${kind} pixels at ${x},${y}`).to.be.greaterThan(5);
    });
}
it('shows a real labelled sample of every cut type, including tabs and variable-depth V-carving, with unchanged output', () => {
    cy.freshProject();
    cy.viewport(1280, 720);
    let project, code;
    cy.window()
        .then({ timeout: 120000 }, (win) => cutDepthDemo(win))
        .then((p) => {
            project = p;
            return load(p);
        });
    cy.contains('Loaded cut-depth-samples.gcam.json.').should('be.visible');
    cy.get('[aria-label="Cut depths"]', { timeout: 30000 })
        .should('not.contain', 'Calculating')
        .and('not.contain', 'unavailable')
        .and('contain', 'through');
    cy.contains('button', /^Fit$/).click();
    patch(25, 125, 'cut');
    patch(40, 124, 'stock');
    patch(93, 125, 'cut');
    patch(120, 125, 'stock');
    patch(177, 125, 'cut');
    patch(200, 125, 'stock');
    patch(30, 45, 'cut');
    patch(96, 45, 'cut');
    patch(105, 45, 'stock');
    patch(176, 29, 'stock');
    patch(184, 30, 'cut');
    patch(184, 34, 'cut');
    patch(200, 42, 'cut');
    patch(200, 28, 'cut');
    patch(200, 51, 'cut');
    cy.window().then(async (win) => {
        const { buildCutDepthPreview } = await win.eval(
            "import('/src/lib/cut-depth-preview.ts')",
        );
        const image = buildCutDepthPreview([project.stack[5].toolpath], 12);
        const vertices = project.stack[5].args.loops[0].points;
        let checked = 0;
        for (let y = 26; y < 65; y++)
            for (let x = 176; x < 230; x++) {
                const distances = vertices.slice(0, -1).map((a, i) => {
                    const b = vertices[i + 1];
                    return (
                        ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) /
                        Math.hypot(b.x - a.x, b.y - a.y)
                    );
                });
                if (Math.min(...distances) < 1) continue;
                const col = Math.floor((x - image.minX) / image.cellMm);
                const row = Math.floor((image.maxY - y) / image.cellMm);
                expect(
                    image.light[(row * image.width + col) * 4 + 3],
                    `triangle interior ${x},${y}`,
                ).to.equal(255);
                checked++;
            }
        expect(checked).to.be.greaterThan(800);
        const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        );
        const capped = await buildToolpathGcodeAsync({
            ...project.stack[5].args,
            cutDepth: 5,
            geometryOnly: true,
        });
        expect(
            capped.toolpath.motionPaths.some((path) =>
                path.points.some((p) => p.z > 0),
            ),
            'depth-limited roughing retains positive clearance Z',
        ).to.equal(true);
    });
    cy.snapshot().then((p) => {
        expect(p.stack).to.have.length(6);
        expect(
            JSON.stringify(p.stack) === JSON.stringify(project.stack),
        ).to.equal(true);
        const z = p.stack[5].toolpath.motionPaths.flatMap((path) =>
            path.points.map((v) => v.z),
        );
        expect(new Set(z.map((v) => v.toFixed(2))).size).to.be.greaterThan(1);
        expect(
            p.stack[5].toolpath.motionPaths.some((path) =>
                path.points.some(
                    (v, i) =>
                        i > 0 && Math.abs(v.z - path.points[i - 1].z) > 0.01,
                ),
            ),
        ).to.equal(true);
    });
    cy.readDownload('.gcam.json').then((raw) =>
        cy.writeFile('../outputs/cut-depth-samples.gcam.json', raw),
    );
    cy.get('[aria-label="Edit Pocket"]')
        .closest('.animate-in')
        .should('have.css', 'opacity', '1');
    cy.screenshot('all-cut-depth-samples-light', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((c) => {
        code = c;
        cy.writeFile('../outputs/cut-depth-samples.gcode', c);
    });
    cy.menu('View', 'Dark / Light Mode');
    cy.get('[aria-label="Cut depths"]').should('be.visible');
    cy.screenshot('all-cut-depth-samples-dark', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((c) => expect(c === code).to.equal(true));
    cy.get('[aria-label="Laser"]').click();
    cy.get('[aria-label="Cut depths"]').should('not.exist');
    cy.get('[aria-label="Milling"]').click();
    cy.get('[aria-label="Cut depths"]').should('be.visible');
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.get('[aria-label="Cut depths"]', { timeout: 30000 })
        .should('not.contain', 'Calculating')
        .and('not.contain', 'unavailable');
});
