const OUT = 'C:/Users/kevin/AppData/Local/Temp/claude/C--sienci-gcam-react/521cd152-47a2-447b-be3a-91e2ee4a68eb/scratchpad/repro-';
const FIXTURES = ['laser-clones.svg', 'laser-mixed-curves.svg', 'laser-shared.svg'];
for (const name of FIXTURES)
    it(`export after ${name}`, () => {
        let error = null;
        Cypress.on('uncaught:exception', (err) => {
            error = err.message;
            return false;
        });
        cy.freshProject();
        cy.viewport(1280, 720);
        cy.get('input[aria-label="Import drawing file"]').selectFile(`cypress/fixtures/${name}`, { force: true });
        cy.wait(2000);
        const tryExport = (stage) => {
            error = null;
            cy.task('clearDownloads');
            cy.menu('File', 'Export Project');
            cy.wait(1500);
            cy.task('download', '.gcam.json').then((raw) =>
                cy.writeFile(`${OUT}${name}-${stage}.txt`, raw === null ? `FAIL ${error}` : `OK ${raw.length}`),
            );
        };
        tryExport('shapes');
        cy.contains('button', /^V-Carve$/).click();
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', 'Test v-bit').click();
        cy.contains('Preview: Calculating toolpath', { timeout: 60000 }).should('not.exist');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('[aria-label^="Edit V-Carve"]', { timeout: 60000 }).should('exist');
        tryExport('vcarve');
    });
