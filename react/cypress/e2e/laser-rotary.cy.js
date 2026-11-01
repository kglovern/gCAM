function loadExistingRotaryProject() {
    cy.freshProject({ tools: false });
    cy.importDesign('vectors.svg');
    cy.get('[aria-label="Laser"]').click();
    cy.contains('summary', 'Rotary attachment').should('not.exist');
    cy.snapshot().then((snapshot) =>
        cy.window().then(async (win) => {
            const { DEFAULT_LASER_ROTARY } = await win.eval(
                "import('/src/cam/laser-rotary.js')",
            );
            const { serializeProject } = await win.eval(
                "import('/src/lib/project.ts')",
            );
            const text = serializeProject({
                ...snapshot,
                stock: { ...snapshot.stock, laserRotary: DEFAULT_LASER_ROTARY },
            });
            cy.get('input[aria-label="Import project file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(text),
                    fileName: 'existing-rotary.gcam.json',
                    mimeType: 'application/json',
                },
                { force: true },
            );
        }),
    );
    cy.contains('label', 'Use a rotary attachment')
        .find('input')
        .should('be.checked');
}

describe('Laser rotary jobs', () => {
    it('saves calibrated rotary setup, exports A motion, previews physical dimensions and returns to flat output', () => {
        loadExistingRotaryProject();
        cy.get('[aria-label="Laser rotary axis"]').select('A');
        cy.contains('button', 'Use circumference as height').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}40');
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('Check the rotary calibration').should('be.visible');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.disabled',
        );
        cy.contains('label', 'Axis and travel per revolution checked')
            .find('input')
            .check();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code.includes('G93')).to.equal(true);
            expect(code).to.match(/G1 X[\d.-]+ A[\d.-]+ S400 F/);
            expect(code).not.to.match(/G[01] [^\n]*[YZ]/);
        });
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Unwrapped rotary preview').should('be.visible');
        cy.contains('Drag to orbit', { timeout: 30000 }).should('be.visible');
        cy.get('[aria-label="Laser"]').click();
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Laser rotary axis"]').should('have.value', 'A');
        cy.contains('label', 'Axis and travel per revolution checked')
            .find('input')
            .should('be.checked');
        cy.contains('label', 'Use a rotary attachment').find('input').uncheck();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).not.to.include('G93');
            expect(code).not.to.match(/G1 X[\d.-]+ A/);
            expect(code).to.match(/G1 [XY][\d.-]+(?: [XY][\d.-]+)? S400/);
        });
    });
    it('uses roller calibration and reversed Z output', () => {
        loadExistingRotaryProject();
        cy.get('[aria-label="Laser rotary type"]').select('roller');
        cy.get('[aria-label="Laser rotary axis"]').select('Z');
        cy.get('[aria-label="Laser object diameter"]')
            .type('{selectall}80')
            .blur();
        cy.get('[aria-label="Laser roller diameter"]')
            .type('{selectall}20')
            .blur();
        cy.contains('label', 'Reverse rotation').find('input').check();
        cy.contains('label', 'Axis and travel per revolution checked')
            .find('input')
            .check();
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}25');
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.match(/G1 X[\d.-]+ Z-[\d.]+ S250 F/);
            expect(code).not.to.include('G93');
        });
    });
});
