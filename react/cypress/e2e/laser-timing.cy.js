function seekTime(value) {
    return cy.get('[aria-label="Preview time"]').then(($range) => {
        const input = $range[0],
            win = input.ownerDocument.defaultView;
        Object.getOwnPropertyDescriptor(
            win.HTMLInputElement.prototype,
            'value',
        ).set.call(input, String(value));
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
}
function gpuPixels(kind) {
    return cy.get('[aria-label="G-code preview"] canvas').then(($canvas) =>
        cy.window().then(
            (win) =>
                new Promise((resolve) =>
                    win.requestAnimationFrame(() => {
                        const canvas = $canvas[0],
                            gl = canvas.getContext('webgl2');
                        expect(gl).not.equal(null);
                        const pixels = new Uint8Array(
                            canvas.width * canvas.height * 4,
                        );
                        gl.readPixels(
                            0,
                            0,
                            canvas.width,
                            canvas.height,
                            gl.RGBA,
                            gl.UNSIGNED_BYTE,
                            pixels,
                        );
                        expect(gl.getError()).equal(gl.NO_ERROR);
                        let count = 0,
                            x = 0,
                            y = 0;
                        for (let i = 0; i < pixels.length; i += 4) {
                            const r = pixels[i],
                                g = pixels[i + 1],
                                b = pixels[i + 2];
                            const matches =
                                kind === 'cursor'
                                    ? r > 220 && g > 115 && g < 190 && b < 80
                                    : r > 240 && g < 100 && b < 100;
                            if (matches) {
                                count++;
                                x += (i / 4) % canvas.width;
                                y += Math.floor(i / 4 / canvas.width);
                            }
                        }
                        resolve({
                            count,
                            x: x / Math.max(1, count),
                            y: y / Math.max(1, count),
                            width: canvas.width,
                            height: canvas.height,
                        });
                    }),
                ),
        ),
    );
}
function fillTiming() {
    for (const axis of ['X', 'Y', 'Z']) {
        cy.get('[aria-label="' + axis + ' Maximum speed (mm/min)"]').type(
            '6000',
        );
        cy.get('[aria-label="' + axis + ' Acceleration (mm/s²)"]').type('100');
    }
}
function seconds(text) {
    const match = text.match(/([0-9]+):([0-9]+):([0-9]+)/);
    expect(match).not.equal(null);
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
describe('Offline laser timing', () => {
    it('uses explicit machine values, invalidates changed assumptions, saves them locally and preserves G-code', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
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
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Drag to orbit', { timeout: 90000 }).should('be.visible');
        let canonical, original;
        // Earlier specs can leave G-code in the shared downloads folder.
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.gcode').then((code) => {
            canonical = code;
        });
        cy.contains('summary', /^G-code/).click();
        const panel = '[aria-label="Laser time estimate"]';
        cy.get(panel).find('summary').click();
        cy.get('[aria-label="X Maximum speed (mm/min)"]').should(
            'have.value',
            '',
        );
        for (const axis of ['X', 'Y', 'Z']) {
            cy.get('[aria-label="' + axis + ' Maximum speed (mm/min)"]').type(
                '6000',
            );
            cy.get('[aria-label="' + axis + ' Acceleration (mm/s²)"]').type(
                '100',
            );
        }
        cy.get(panel)
            .contains('button', /^Estimate$/)
            .click();
        cy.get('[aria-label="Estimated job time"]', { timeout: 30000 })
            .should('contain.text', 'estimated')
            .then(($value) => {
                original = seconds($value.text());
                expect(original).greaterThan(0);
            });
        cy.get('[aria-label="Preview time"]').should('be.enabled');
        cy.get('[aria-label="Preview speed multiplier"]').should(
            'have.value',
            '1',
        );
        cy.get(panel).find('summary').click();
        cy.contains('button', /^Fit view$/)
            .click()
            .should('be.enabled');
        let cursorStart;
        cy.get('[aria-label="Reset preview"]').click();
        gpuPixels('cursor').then((sample) => {
            expect(sample.count).greaterThan(0);
            cursorStart = sample;
        });
        cy.get('[aria-label="Preview time"]').then(($range) =>
            seekTime(Number($range.attr('max')) / 2),
        );
        gpuPixels('cursor').then((sample) => {
            expect(sample.count).greaterThan(0);
            expect(
                Math.hypot(sample.x - cursorStart.x, sample.y - cursorStart.y),
            ).greaterThan(3);
        });
        cy.screenshot('laser-timed-playback', { capture: 'viewport' });
        cy.get('[aria-label="Reset preview"]').click();
        cy.get('[aria-label="Preview speed multiplier"]').select('2');
        cy.get('[aria-label="Play preview"]').click();
        cy.get('[aria-label="Preview time"]').should(($range) =>
            expect(Number($range.val())).greaterThan(0.05),
        );
        cy.get('[aria-label="Pause preview"]').click();
        cy.get(panel).find('summary').click();
        cy.get('[aria-label="X Acceleration (mm/s²)"]')
            .type('{selectall}1')
            .blur();
        cy.get('[aria-label="Estimated job time"]').should('not.exist');
        cy.get('[aria-label="Preview time"]').should('not.exist');
        cy.get(panel)
            .contains('button', /^Estimate$/)
            .click();
        cy.get('[aria-label="Estimated job time"]', { timeout: 30000 }).should(
            ($value) => {
                expect(seconds($value.text())).greaterThan(original);
            },
        );
        cy.screenshot('laser-time-estimate', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.gcode').then((code) => expect(code).equal(canonical));
        cy.reload();
        cy.get('[aria-label="Laser"]').click();
        cy.get('[aria-label="Simulation"]').click();
        cy.get(panel).find('summary').click();
        cy.get('[aria-label="X Acceleration (mm/s²)"]').should(
            'have.value',
            '1',
        );
        cy.get('[aria-label="Estimated job time"]').should('not.exist');
        cy.get('[aria-label="Milling"]').click();
        cy.get(panel).should('not.exist');
    });
    it('renders full circles from planned geometry and holds the cursor during dwell', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Config"]').click();
        cy.contains('summary', 'Customise output').click();
        cy.contains('summary', 'Command blocks').click();
        cy.get('#gcode-start')
            .type('G0 X100 Y100\nG91.1\nM4 S1000\nG2 I-20 F600\nG4 P2\nM5', {
                parseSpecialCharSequences: false,
            })
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
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Drag to orbit', { timeout: 90000 }).should('be.visible');
        cy.contains('summary', /^G-code/).click();
        let before, during;
        cy.contains('button', /^Fit view$/)
            .click()
            .should('be.enabled');
        gpuPixels('laser').then((sample) => {
            expect(sample.count).greaterThan(30);
            before = sample.count;
        });
        cy.screenshot('laser-full-circle-before-estimate', {
            capture: 'viewport',
            disableTimersAndAnimations: false,
        });
        const panel = '[aria-label="Laser time estimate"]';
        cy.get(panel).find('summary').click();
        fillTiming();
        cy.get(panel)
            .contains('button', /^Estimate$/)
            .click();
        cy.get('[aria-label="Preview time"]', { timeout: 30000 }).should(
            'be.enabled',
        );
        cy.get(panel).find('summary').click();
        cy.contains('button', /^Fit view$/)
            .click()
            .should('be.enabled');
        gpuPixels('laser').then((sample) => {
            expect(sample.count).greaterThan(30);
            cy.writeFile('../outputs/laser-preview-circle-pixels.json', {
                unestimated: before,
                estimated: sample.count,
            });
        });
        seekTime(15);
        gpuPixels('cursor').then((sample) => {
            expect(sample.count).greaterThan(0);
            during = sample;
        });
        seekTime(16);
        gpuPixels('cursor').then((sample) => {
            expect(sample.count).greaterThan(0);
            expect(
                Math.hypot(sample.x - during.x, sample.y - during.y),
            ).lessThan(1);
        });
        cy.screenshot('laser-full-circle-dwell', { capture: 'viewport' });
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.gcode').then((code) =>
            expect(code).match(/G2\s+I-20/),
        );
    });
});
