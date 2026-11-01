describe('Controller-aware job delivery', () => {
    it('shares file names and bytes across main/Simulation export and compatible handoff routes', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        const desktop = [],
            tablets = [];
        const blockedTransports = [];
        cy.intercept('**/gcam/v1/**', (request) => {
            blockedTransports.push(request.url);
            request.reply({ statusCode: 503, body: {} });
        });
        cy.on('window:before:load', (win) => {
            win.gcamGsender = {
                ping: async () => ({
                    status: 200,
                    body: { version: 'test' },
                }),
                send: async (request) => {
                    desktop.push(request);
                    return { status: 202, body: { name: request.name } };
                },
            };
            const state = {
                browsing: true,
                tablets: [
                    {
                        id: 'test-tablet',
                        name: 'Test Tablet',
                        paired: true,
                        online: true,
                    },
                ],
            };
            win.gcamPendant = {
                discover: async () => state,
                onChanged: () => () => {},
                send: async (request) => {
                    tablets.push(request);
                    return { ok: true };
                },
            };
        });
        cy.reload();
        cy.get('[aria-label="Config"]').click();
        cy.contains('summary', 'Customise output').click();
        cy.contains('label', 'File extension')
            .find('input')
            .type('{selectall}tap')
            .blur();
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}40')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]', {
            timeout: 30000,
        }).should('exist');
        let canonical;
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.tap').then((code) => {
            canonical = code;
            expect(code).contain('S400');
        });
        cy.contains('button', /^Send to gSender$/).click();
        cy.contains('Sent to gSender').should('be.visible');
        cy.contains('button', /^Send to Test Tablet$/).click();
        cy.contains('Sent to Test Tablet').should('be.visible');
        cy.get('[aria-label="Simulation"]').click();
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.tap').then((code) => expect(code).equal(canonical));
        cy.contains('button', /^Send to gSender$/).click();
        cy.contains('Sent to gSender').should('be.visible');
        cy.contains('button', /^Send to Test Tablet$/).click();
        cy.contains('Sent to Test Tablet').should('be.visible');
        cy.then(() => {
            expect(blockedTransports.length).equal(0);
            expect(desktop.length).equal(2);
            expect(tablets.length).equal(2);
            for (const request of [...desktop, ...tablets]) {
                expect(request.name).equal('vectors.tap');
                expect(request.gcode).equal(canonical);
            }
        });
        cy.get('[aria-label="Config"]').click();
        cy.contains('label', 'Controller preset').find('select').select('duet');
        cy.contains('summary', 'Customise output').click();
        cy.contains('label', 'File extension')
            .find('input')
            .type('{selectall}g')
            .blur();
        cy.contains(
            'label',
            'Laser mode and full-power value match my firmware',
        )
            .find('input')
            .check();
        cy.get('[aria-label="Laser"]').click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/)
            .should('be.enabled')
            .click();
        let duet;
        cy.readDownload('.g').then((code) => {
            duet = code;
            expect(code).contain('S102');
        });
        cy.contains('button', /^Send to gSender$/)
            .should('be.disabled')
            .and('have.attr', 'title')
            .and('contain', 'Grbl and grblHAL');
        cy.contains('button', /^Send to Test Tablet$/).should('be.disabled');
        cy.get('[aria-label="Simulation"]').click();
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/)
            .should('be.enabled')
            .click();
        cy.readDownload('.g').then((code) => expect(code).equal(duet));
        cy.contains('button', /^Send to gSender$/).should('be.disabled');
        cy.contains('button', /^Send to Test Tablet$/).should('be.disabled');
        cy.screenshot('controller-aware-delivery', { capture: 'viewport' });
        cy.then(() => {
            expect(blockedTransports.length).equal(0);
            expect(desktop.length).equal(2);
            expect(tablets.length).equal(2);
        });
    });
});
