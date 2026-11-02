describe('Laser planned motion bounds', () => {
    it('distinguishes overscan from stock marks and checks travel span, units and output inclusion', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.window().then((win) => {
            win.localStorage.setItem('gcam.machineProfileId', 'custom');
            win.localStorage.setItem(
                'gcam.machineTravelLimits',
                JSON.stringify({
                    maxXTravelMm: 50,
                    maxYTravelMm: 100,
                    minZTravelMm: -50,
                    maxZTravelMm: null,
                }),
            );
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Stock Width (mm)"]').type('{selectall}60').blur();
        cy.get('[aria-label="Stock Height (mm)"]').type('{selectall}70').blur();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.get('[aria-label="Laser line interval"]')
            .type('{selectall}1')
            .blur();
        cy.contains('summary', 'Laser options').click();
        cy.get('[aria-label="Hatch overscan"]').type('{selectall}30').blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Laser path bounds"]').find('summary').click();
        cy.get('[aria-label="Laser path bounds"]').within(() => {
            cy.contains('tr', 'Laser on').should('contain.text', '20 … 40');
            cy.contains('tr', 'Head travel').should('contain.text', '-10 … 70');
            cy.contains('Laser-on paths extend outside the stock.').should(
                'not.exist',
            );
            cy.contains(
                'Head travel exceeds the configured X travel span.',
            ).should('be.visible');
        });
        cy.contains('Drag to orbit', { timeout: 90000 }).should('be.visible');
        cy.screenshot('laser-overscan-bounds', { capture: 'viewport' });
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Stock origin"]').select('center');
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Laser path bounds"]').find('summary').click();
        cy.contains('Laser-on paths extend outside the stock.').should(
            'be.visible',
        );
        cy.window().then(async (win) => {
            const { ProjectAutosaveStore } = await win.eval(
                "import('/src/lib/autosave.ts')",
            );
            const store = new ProjectAutosaveStore();
            for (let i = 0; i < 50; i++) {
                const p = (await store.load())?.snapshot;
                if (p?.stock?.origin === 'center' && p.stack.length) {
                    win.localStorage.setItem('gcam.units', 'imperial');
                    return;
                }
                await new Promise((resolve) => win.setTimeout(resolve, 100));
            }
            throw Error('Laser bounds autosave missing');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Laser path bounds"]').find('summary').click();
        cy.contains('Centreline positions (in)').should('be.visible');
        cy.contains('tr', 'Head travel').should(
            'contain.text',
            '-0.394 … 2.756',
        );
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label^="Output Laser Fill"]').uncheck();
        cy.get('[aria-label="Simulation"]').click();
        cy.get('[aria-label="Laser path bounds"]').should('not.exist');
    });
});
