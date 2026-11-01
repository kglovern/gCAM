describe('Flat laser scan alignment', () => {
    it('exports an uncorrected calibration sheet and retains the job calibration when device defaults change', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.contains('button', 'Engrave image').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        cy.get('[aria-label="Laser feed"]').type('{selectall}2000').blur();
        cy.contains('summary', 'Scan alignment').click();
        cy.contains('button', 'Add speed').click().click();
        cy.get('[aria-label="Alignment speed 1"]')
            .type('{selectall}1000')
            .blur();
        cy.get('[aria-label="Alignment speed 2"]')
            .type('{selectall}3000')
            .blur();
        cy.get('[aria-label="Alignment gap 1"]').type('{selectall}0.2').blur();
        cy.get('[aria-label="Alignment gap 2"]').type('{selectall}0.6').blur();
        cy.task('clearDownloads');
        cy.contains('button', 'Download alignment test').click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('F1000');
            expect(code).to.include('F3000');
            expect(code).to.include('S50');
            expect(code).to.include('M4 S0');
            expect(code).not.to.match(/G[01] .*Z/);
        });
        cy.contains('label', 'Enable measured scan alignment')
            .find('input')
            .check();
        cy.contains('button', 'Save for laser').click();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((project) => {
            expect(
                project.stack[0].args.laserOptions.scanAlignment,
            ).to.deep.equal({
                enabled: true,
                measurements: [
                    { feed: 1000, gap: 0.2 },
                    { feed: 3000, gap: 0.6 },
                ],
            });
        });
        cy.window().then(async (win) => {
            for (let i = 0; i < win.localStorage.length; i++) {
                const key = win.localStorage.key(i);
                if (key.startsWith('gcam.scanAlignment.v1.'))
                    win.localStorage.setItem(
                        key,
                        JSON.stringify({
                            enabled: true,
                            measurements: [
                                { feed: 1000, gap: 1 },
                                { feed: 3000, gap: 1 },
                            ],
                        }),
                    );
            }
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            for (let i = 0; i < 50; i++) {
                const saved = await new ProjectAutosaveStore().load();
                if (
                    saved?.snapshot.stack[0]?.args.laserOptions?.scanAlignment
                        ?.enabled
                )
                    return;
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw new Error('Aligned job was not autosaved');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('button[aria-label^="Edit Laser Raster"]').click();
        cy.contains('summary', 'Scan alignment').click();
        cy.get('[aria-label="Alignment gap 1"]').should('have.value', '0.2');
        cy.get('[aria-label="Alignment gap 2"]').should('have.value', '0.6');
        cy.contains('label', 'Enable measured scan alignment')
            .find('input')
            .should('be.checked');
        cy.get('[aria-label="Processed laser image preview"]').should(
            ($canvas) => {
                const canvas = $canvas[0];
                const pixels = canvas
                    .getContext('2d')
                    .getImageData(0, 0, canvas.width, canvas.height).data;
                expect(pixels.some((v, i) => i % 4 !== 3 && v < 200)).to.equal(
                    true,
                );
            },
        );
        cy.contains('summary', 'Scan alignment').scrollIntoView({
            offset: { top: -12, left: 0 },
        });
        cy.screenshot('laser-scan-alignment-test-values', {
            capture: 'viewport',
        });
    });
});
