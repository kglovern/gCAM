const tools = ['flat', 'ball', 'v-bit'].map((toolType, index) => ({
    slot: index + 1,
    name: `Test ${toolType}`,
    toolType,
    cuttingDiameterMm:
        toolType === 'v-bit' ? 15 : toolType === 'ball' ? 1.5875 : 3.175,
    cuttingLengthMm: 30,
    flutes: 2,
    fluteAngleDeg: 60,
    cutterMaterial: 'carbide',
    libraryToolId: [
        'sienci-1-8-flat-downcut_end-mill_3-10pc_pack',
        'sienci-1-8-ballnose-upcut_endmill_3pc_or_10pc',
        'sienci-15mm_60-degree-v-bit',
    ][index],
    vendor: '',
    vendorDisplayName: '',
    storeUrl: '',
    image: '',
}));

Cypress.Commands.add('freshProject', (options = {}) => {
    cy.visit('/cypress/fixtures/reset.html');
    cy.window().then(
        (win) =>
            new Cypress.Promise((resolve, reject) => {
                const request = win.indexedDB.deleteDatabase('gcam');
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
                request.onblocked = () =>
                    reject(new Error('Project database still open'));
            }),
    );
    cy.visit('/', {
        onBeforeLoad(win) {
            win.localStorage.clear();
            win.localStorage.setItem('gcam.machineSetupComplete', 'true');
            win.localStorage.setItem(
                'gcam.machineProfileId',
                'longmill-router',
            );
            if (options.tools !== false)
                win.localStorage.setItem(
                    'gcam.myEndmills.v1',
                    JSON.stringify({ slots: tools }),
                );
            win.localStorage.setItem(
                'gcam.grid.v1',
                JSON.stringify({
                    visible: true,
                    spacingMm: 10,
                    snap: true,
                    style: 'lines',
                }),
            );
        },
    });
    // New Project also clears any recovery which completed during startup.
    cy.contains('button', 'New Empty Canvas').should('be.visible').click();
    cy.get('[data-testid="gcam-canvas"]').should('be.visible');
});
Cypress.Commands.add('menu', (name, item) => {
    cy.get(`button[aria-label="${name}"]`).then(($button) => {
        if ($button.attr('aria-expanded') !== 'true') cy.wrap($button).click();
    });
    cy.contains('[role="menuitem"]', item).should('be.visible').click();
});
Cypress.Commands.add('importDesign', (file) => {
    cy.get('input[aria-label="Import drawing file"]').selectFile(
        `cypress/fixtures/${file}`,
        { force: true },
    );
    if (file.endsWith('.svg') || file.endsWith('.dxf')) {
        cy.contains(`${file}:`).should('contain.text', 'vectors');
        cy.get('[data-testid="gcam-canvas"]').should(($el) => {
            expect(JSON.parse($el.attr('data-camera')).scale).to.be.greaterThan(
                1,
            );
        });
    }
});
Cypress.Commands.add('field', (text, value) => {
    cy.contains('label', text)
        .find('input')
        .first()
        .clear()
        .type(String(value))
        .blur();
});
Cypress.Commands.add('worldClick', (x, y, options = {}) => {
    cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
        const canvas = $canvas[0];
        const camera = JSON.parse(canvas.dataset.camera);
        const rect = canvas.getBoundingClientRect();
        const point = {
            eventConstructor: 'MouseEvent',
            clientX: rect.left + camera.tx + x * camera.scale,
            clientY: rect.top + camera.ty - y * camera.scale,
            button: 0,
            ...options,
        };
        cy.wrap($canvas)
            .trigger('mousemove', point)
            .trigger('mousedown', point)
            .trigger('mouseup', point);
    });
});
Cypress.Commands.add('worldDrag', (from, to, options = {}) => {
    cy.get('[data-testid="gcam-canvas"]').then(($canvas) => {
        const camera = JSON.parse($canvas[0].dataset.camera);
        const rect = $canvas[0].getBoundingClientRect();
        const screen = ([x, y]) => ({
            eventConstructor: 'MouseEvent',
            clientX: rect.left + camera.tx + x * camera.scale,
            clientY: rect.top + camera.ty - y * camera.scale,
            button: 0,
            ...options,
        });
        cy.wrap($canvas)
            .trigger('mousemove', screen(from))
            .trigger('mousedown', screen(from))
            .trigger('mousemove', { ...screen(to), buttons: 1 })
            .trigger('mouseup', screen(to));
    });
});
Cypress.Commands.add('snapshot', () => {
    cy.task('clearDownloads');
    cy.menu('File', 'Export Project');
    return cy
        .readDownload('.gcam.json')
        .then((raw) => JSON.parse(raw).snapshot);
});
Cypress.Commands.add('readDownload', (extension) => {
    const poll = (attempt = 0) =>
        cy.task('download', extension).then((raw) => {
            if (raw !== null) return raw;
            if (attempt > 50)
                throw new Error(`Missing downloaded ${extension}`);
            return cy.wait(100).then(() => poll(attempt + 1));
        });
    return poll();
});
Cypress.Commands.add('addOperation', (label, options = {}) => {
    cy.contains('button', new RegExp(`^${label}$`)).click();
    if (!label.startsWith('Laser')) {
        const cutter = [
            'Wavy',
            'Halftone',
            'V-Carve',
            'V-Bit Countersink',
            'Texture Fill',
            'Chamfer',
        ].includes(label)
            ? 'v-bit'
            : label === '3D Surface Finish' || label === '3D Waterline Finish'
              ? 'ball'
              : 'flat';
        cy.get('button[aria-label="Tool library slot"]').click();
        cy.contains('[role="option"]', `Test ${cutter}`).click();
    }
    if (label === 'Halftone') cy.field('Holes across', 8);
    if (label.startsWith('3D')) cy.field('Machining detail', 1);
    if (options.texture)
        cy.contains('label', 'Texture type')
            .find('select')
            .select(options.texture);
    if (options.rectangle) {
        cy.get('[aria-label="Machining boundary"]').select('rectangle');
        cy.field('Boundary margin', 1);
    }
    if (options.fit) {
        cy.field('Job stock thickness', 5);
        cy.contains(
            'button',
            options.fit === 'z'
                ? 'Fit to stock — scale Z only'
                : 'Fit to stock — scale XYZ together',
        ).click();
    }
    cy.contains('button', /^Add Toolpath/)
        .should('be.enabled')
        .click();
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/, {
        timeout: 60000,
    }).should('be.enabled');
    cy.get('[aria-label="Simulation"]').should(
        'not.have.attr',
        'aria-current',
        'page',
    );
    cy.snapshot().then((project) => {
        expect(project.stack).to.have.length(1);
        expect(project.stack[0].preview.length).to.be.greaterThan(0);
        if (options.rectangle)
            expect(project.stack[0].args.surfaceBoundaryMode).to.equal(
                'rectangle',
            );
        if (options.fit === 'z') {
            expect(project.bitmaps[0].w).to.be.closeTo(20, 0.01);
            expect(project.bitmaps[0].surfaceMesh.zScale).to.be.closeTo(
                0.5,
                0.001,
            );
        }
        if (options.fit === 'uniform')
            expect(project.bitmaps[0].w).to.be.closeTo(10, 0.01);
    });
    cy.task('clearDownloads');
    cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
    cy.readDownload('.nc').then((gcode) => {
        expect(gcode).to.match(/G0?[123]\b/);
        expect(gcode).not.to.match(/NaN|Infinity|undefined/);
        expect(gcode).to.match(/M(?:2|30)\b/);
        if (label.startsWith('3D')) {
            const cuttingZ = gcode
                .split('\n')
                .filter((line) => /^G0?[123]\b/.test(line))
                .flatMap((line) => {
                    const match = line.match(/\bZ(-?[\d.]+)/);
                    return match ? [Number(match[1])] : [];
                });
            expect(cuttingZ.length).to.be.greaterThan(0);
            expect(Math.min(...cuttingZ)).to.be.at.least(
                options.fit ? -5.001 : -18.001,
            );
            // Rough clearing retains the default 0.35 mm finishing allowance.
            expect(Math.max(...cuttingZ)).to.be.at.most(
                label === '3D Surface Clear' ? 0.351 : 0.001,
            );
        }
    });
});
