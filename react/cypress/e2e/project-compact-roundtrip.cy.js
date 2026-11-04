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
const exportGcode = () => {
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
        .should('be.enabled')
        .click();
    return cy.readDownload('.gcode');
};

it('compact project files omit V-carve geometry and rebuild identical G-code', () => {
    cy.freshProject();
    cy.viewport(1280, 720);
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    fileName: 'compact',
                    snapshot: {
                        loops: [
                            rect('outer', 20, 20, 80, 60),
                            rect('hole', 50, 40, 20, 20),
                        ],
                        selected: ['outer', 'hole'],
                        hidden: [],
                        stack: [],
                        bitmaps: [],
                        guides: [],
                    },
                }),
            ),
            fileName: 'compact.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.contains('Loaded compact.gcam.json.').should('be.visible');
    cy.contains('button', /^V-Carve$/).click();
    cy.get('button[aria-label="Tool library slot"]').click();
    cy.contains('[role="option"]', 'Test v-bit').click();
    cy.contains('Preview: Calculating toolpath').should('not.exist');
    cy.contains('button', /^Add Toolpath/).click();
    cy.get('[aria-label^="Edit V-Carve"]', { timeout: 60000 }).should('exist');
    let original, raw;
    exportGcode().then((code) => {
        original = code;
        expect(code).to.match(/G1 X[\d.]+ Y[\d.]+ Z-/);
    });
    cy.task('clearDownloads');
    cy.menu('File', 'Export Project');
    cy.readDownload('.gcam.json').then((text) => {
        raw = text;
        const doc = JSON.parse(text);
        expect(doc.version).to.equal(5);
        const [entry] = doc.snapshot.stack;
        expect(entry.toolpath.pendingRegeneration).to.have.property('digest');
        expect(entry.toolpath).not.to.have.property('motionPaths');
        expect(entry.preview).to.deep.equal([]);
    });
    cy.freshProject();
    cy.then(() =>
        cy.get('input[aria-label="Import project file"]').selectFile(
            {
                contents: Cypress.Buffer.from(raw),
                fileName: 'compact.gcam.json',
                mimeType: 'application/json',
            },
            { force: true },
        ),
    );
    cy.contains('Loaded compact.gcam.json.', { timeout: 60000 }).should(
        'be.visible',
    );
    cy.contains('rebuilt differently').should('not.exist');
    cy.get('[aria-label^="Edit V-Carve"]').should('exist');
    exportGcode().then((code) => expect(code).to.equal(original));
});
