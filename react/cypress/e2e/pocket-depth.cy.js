const rect = (id, x, y, w, h) => ({
    id,
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
                    fileName: 'Pocket depths',
                    snapshot: p,
                }),
            ),
            fileName: 'depths.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
function pixelColor(x, y, rgb) {
    cy.get('[data-testid="gcam-canvas"]').should(($c) => {
        const canvas = $c[0],
            cam = JSON.parse(canvas.dataset.camera),
            px = Math.round(cam.tx + x * cam.scale),
            py = Math.round(cam.ty - y * cam.scale),
            size = 11;
        const data = canvas
            .getContext('2d')
            .getImageData(px - 5, py - 5, size, size).data;
        let matches = 0;
        for (let i = 0; i < data.length; i += 4)
            if (
                Math.abs(data[i] - rgb[0]) <= 1 &&
                Math.abs(data[i + 1] - rgb[1]) <= 1 &&
                Math.abs(data[i + 2] - rgb[2]) <= 1
            )
                matches++;
        expect(matches, `painted region at ${x},${y}`).to.be.greaterThan(45);
    });
}
it('renders depth, island and overlap pixels in both themes; preview changes leave project and G-code intact', () => {
    cy.viewport(1280, 800);
    cy.freshProject();
    let project, code, colors;
    cy.window()
        .then(async (win) => {
            const { buildToolpathGcodeAsync } = await win.eval(
                    "import('/src/lib/engine.ts')",
                ),
                { previewFor } = await win.eval(
                    "import('/src/toolpaths/useToolpathStack.ts')",
                ),
                { pocketDepthColor } = await win.eval(
                    "import('/src/canvas/pocketDepthPreview.ts')",
                );
            const loops = [
                rect('outer', 10, 10, 80, 70),
                rect('island', 30, 30, 20, 20),
                rect('deep', 70, 20, 50, 45),
            ];
            const stack = [];
            for (const [id, selected, cutDepth] of [
                ['shallow', loops.slice(0, 2), 2],
                ['deep', [loops[2]], 8],
            ]) {
                const args = {
                    operation: 'pocket',
                    loops: selected,
                    cutDepth,
                    toolDiameter: 6,
                    passDepth: 2,
                    toolNumber: 1,
                    feedRate: 1000,
                    plungeRate: 300,
                    spindle: 18000,
                };
                const result = await buildToolpathGcodeAsync({
                    ...args,
                    geometryOnly: true,
                });
                stack.push({
                    id,
                    label: `Pocket ${cutDepth}mm`,
                    args,
                    preview: previewFor(result),
                    toolpath: result.toolpath,
                });
            }
            project = {
                loops,
                stack,
                selected: [],
                hidden: [],
                bitmaps: [],
                guides: [],
                stock: {
                    width: 150,
                    height: 100,
                    thickness: 18,
                    material: 'plywood-mdf',
                    origin: 'front-left',
                },
                fileName: 'Pocket depths',
            };
            colors = Object.fromEntries(
                [false, true].map((d) => [
                    String(d),
                    [2, 8].map((depth) =>
                        pocketDepthColor(depth, d).match(/\d+/g).map(Number),
                    ),
                ]),
            );
            return project;
        })
        .then(load);
    cy.get('[aria-label="Pocket depths"]')
        .should('contain', '2mm')
        .and('contain', '8mm');
    cy.then(() => {
        pixelColor(20, 20, colors.false[0]);
        pixelColor(100, 40, colors.false[1]);
        pixelColor(80, 40, colors.false[1]);
    });
    pixelColor(40, 40, [248, 250, 252]);
    pixelColor(100, 75, [248, 250, 252]);
    cy.get('button[aria-label="Edit Pocket 2mm"]')
        .closest('.animate-in')
        .should('have.css', 'opacity', '1');
    cy.screenshot('pocket-depth-light', { capture: 'viewport' });
    cy.snapshot().then((p) => {
        project = p;
    });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    cy.readDownload('.gcode').then((c) => {
        code = c;
    });
    cy.menu('View', 'Dark / Light Mode');
    cy.then(() => {
        pixelColor(20, 20, colors.true[0]);
        pixelColor(100, 40, colors.true[1]);
        pixelColor(80, 40, colors.true[1]);
    });
    pixelColor(40, 40, [11, 18, 32]);
    cy.screenshot('pocket-depth-dark', { capture: 'viewport' });
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.gcode').then((c) => expect(c).to.equal(code));
    cy.snapshot().then((p) => expect(p.stack).to.deep.equal(project.stack));
    cy.reload();
    cy.contains('Recovered the last local project.', { timeout: 30000 }).should(
        'exist',
    );
    cy.get('[aria-label="Pocket depths"]').should('contain', '8mm');
    cy.then(() => pixelColor(100, 40, colors.true[1]));
    cy.get('[aria-label="Laser"]').click();
    cy.get('[aria-label="Pocket depths"]').should('not.exist');
    cy.get('[aria-label="Milling"]').click();
    cy.get('[aria-label="Pocket depths"]').should('be.visible');
    cy.then(() =>
        load({
            ...project,
            stack: project.stack.map((s) => ({ ...s, outputEnabled: false })),
        }),
    );
    cy.get('[aria-label="Pocket depths"]').should('not.exist');
    pixelColor(40, 40, [11, 18, 32]);
});
