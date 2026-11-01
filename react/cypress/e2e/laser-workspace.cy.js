describe('Milling and Laser workspaces', () => {
    it('keeps operations and exports separate across switching and reload', () => {
        cy.freshProject();
        cy.importDesign('vectors.svg');
        cy.worldClick(20, 50);
        cy.addOperation('Engrave');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Laser Cut$/).should('exist');
        cy.contains('button', /^Outside$/).should('not.exist');
        cy.get('[aria-label="Open tool library"]').should('not.exist');
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}40');
        cy.contains('summary', 'Laser options').click();
        cy.contains('label', 'Inner shapes first')
            .find('input')
            .should('be.checked');
        cy.contains('label', 'Reduce travel')
            .find('input')
            .should('be.checked')
            .uncheck();
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack).to.have.length(2);
            expect(p.stack[1].args.laserOptions.optimizeTravel).to.equal(false);
        });
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.match(/M4/);
            expect(code).to.match(/S400/);
            expect(code).not.to.match(/G[01] .*Z/);
        });
        cy.get('[aria-label="Milling"]').click();
        cy.contains('.toolpath-rail', 'Laser Cut (').should('not.exist');
        cy.contains('.toolpath-rail', 'Engrave (').should('exist');
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('.toolpath-rail input[aria-label^="Name Laser Cut"]').should(
            'be.visible',
        );
        cy.contains('.toolpath-rail', 'Engrave (').should('not.exist');
        cy.snapshot().then((p) =>
            expect(p.stack[1].args.laserOptions.optimizeTravel).to.equal(false),
        );
    });
    it('names and duplicates laser operations, preserves names on edit, and omits disabled output', () => {
        cy.freshProject({ tools: false });
        cy.importDesign('vectors.svg');
        cy.get('[aria-label="Laser"]').click();
        cy.worldClick(20, 50);
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}40');
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Cut"]').type(
            '{selectall}Outline{enter}',
        );
        cy.get('[aria-label="Duplicate Outline"]').click();
        cy.get('[aria-label="Name Outline copy"]').should(
            'have.value',
            'Outline copy',
        );
        cy.get('[aria-label="Edit Outline copy"]').click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}25');
        cy.contains('button', /^Save Toolpath$/).click();
        cy.get('[aria-label="Name Outline copy"]').should(
            'have.value',
            'Outline copy',
        );
        cy.get('[aria-label="Output Outline"]').uncheck();
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('Outline copy');
            expect(code).to.include('S250');
            expect(code).not.to.include(' - Outline)');
        });
        cy.task('clearDownloads');
        cy.get('[aria-label="Export individual toolpaths"]').click();
        cy.contains('button', /^1\. Outline copy$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S250');
            expect(code).not.to.include(' - Outline)');
        });
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Output Outline"]').should('not.be.checked');
        cy.get('[aria-label="Output Outline copy"]')
            .should('be.checked')
            .uncheck();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.disabled',
        );
        cy.get('[aria-label="Export individual toolpaths"]').should(
            'be.disabled',
        );
        cy.snapshot().then((p) => {
            expect(p.stack).to.have.length(2);
            expect(p.stack[0].toolpath.laserPower).not.to.equal(250);
            expect(p.stack[1].toolpath.laserPower).to.equal(250);
        });
        cy.get('body').type('{ctrl}z');
        cy.get('[aria-label="Output Outline copy"]').should('be.checked');
        cy.get('[aria-label="Output Outline"]').should('not.be.checked');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.viewport(1200, 700);
        cy.get('[aria-label="Name Outline copy"]').scrollIntoView();
        cy.screenshot('laser-operation-controls', { capture: 'fullPage' });
    });
    it('keeps generators under Draw Plugins', () => {
        cy.freshProject();
        cy.get('[aria-label="Draw"]:visible').click();
        cy.contains('summary', 'Plugins').click();
        cy.contains('[role="menuitem"]', 'Clock Face').should('be.visible');
        cy.contains('[role="menuitem"]', 'Mandala').should('be.visible');
    });
});
