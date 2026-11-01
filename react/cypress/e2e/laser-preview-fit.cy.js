function sampleRenderedLaser() {
    return cy.get('[aria-label="G-code preview"] canvas').then(($canvas) =>
        cy.window().then(
            (win) =>
                new Promise((resolve) => {
                    win.requestAnimationFrame(() => {
                        const canvas = $canvas[0],
                            gl = canvas.getContext('webgl2');
                        expect(gl).not.equal(null);
                        const w = canvas.width,
                            h = canvas.height,
                            pixels = new Uint8Array(w * h * 4);
                        gl.readPixels(
                            0,
                            0,
                            w,
                            h,
                            gl.RGBA,
                            gl.UNSIGNED_BYTE,
                            pixels,
                        );
                        expect(gl.getError()).equal(gl.NO_ERROR);
                        let count = 0,
                            minX = w,
                            minY = h,
                            maxX = -1,
                            maxY = -1;
                        for (let y = 0; y < h; y++)
                            for (let x = 0; x < w; x++) {
                                const i = (y * w + x) * 4,
                                    r = pixels[i],
                                    g = pixels[i + 1],
                                    b = pixels[i + 2];
                                if (
                                    r > 240 &&
                                    g < 100 &&
                                    b < 100 &&
                                    r - g > 15 &&
                                    r - b > 15
                                ) {
                                    count++;
                                    minX = Math.min(minX, x);
                                    maxX = Math.max(maxX, x);
                                    minY = Math.min(minY, y);
                                    maxY = Math.max(maxY, y);
                                }
                            }
                        resolve({
                            width: w,
                            height: h,
                            laserPixels: count,
                            spanX: (maxX - minX + 1) / w,
                            spanY: (maxY - minY + 1) / h,
                        });
                    });
                }),
        ),
    );
}

describe('Fitted laser WebGL preview', () => {
    it('renders the first laser palette at useful scale, keeps navigation compact and refits after zoom/resize', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('vectors.svg');
        for (const [x, power] of [
            [20, 100],
            [50, 25],
        ]) {
            cy.worldClick(x, 50);
            cy.contains('button', /^Change$/).click();
            cy.get('[aria-label="Laser power percent"]')
                .type('{selectall}' + power)
                .blur();
            cy.contains('button', /^Add Toolpath/).click();
            cy.get('input[aria-label^="Name Laser Cut"]', {
                timeout: 30000,
            }).should('have.length', x === 20 ? 1 : 2);
        }
        cy.get('[aria-label="Simulation"]').click();
        cy.contains('Drag to orbit', { timeout: 90000 }).should('be.visible');
        cy.contains('button', /^Fit view$/).should('be.enabled');
        cy.get('.gViewer-viewcube').then(($cube) =>
            expect($cube[0].getBoundingClientRect().width).lessThan(60),
        );
        const report = [];
        sampleRenderedLaser().then((sample) => {
            expect(sample.laserPixels).greaterThan(20);
            expect(Math.max(sample.spanX, sample.spanY)).greaterThan(0.09);
            report.push({ phase: 'initial', ...sample });
        });
        cy.screenshot('laser-fitted-preview', { capture: 'viewport' });
        let canonical;
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.gcode').then((code) => {
            canonical = code;
        });
        cy.get('[aria-label="Preview position"]').then(($range) => {
            const total = Number($range.attr('max'));
            expect(total).greaterThan(10);
            const input = $range[0],
                win = input.ownerDocument.defaultView;
            Object.getOwnPropertyDescriptor(
                win.HTMLInputElement.prototype,
                'value',
            ).set.call(input, String(total));
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
        });
        cy.get('[aria-label="Preview program line"]').should(($line) => {
            const [completed, total] = $line
                .text()
                .replace('Line ', '')
                .split('/')
                .map(Number);
            expect(completed).equal(total);
        });
        sampleRenderedLaser().then((sample) => {
            expect(sample.laserPixels).lessThan(report[0].laserPixels);
        });
        cy.get('[aria-label="Reset preview"]').click();
        sampleRenderedLaser().then((sample) => {
            expect(sample.laserPixels).equal(report[0].laserPixels);
        });
        cy.get('[aria-label="Preview speed (lines per second)"]').select('25');
        cy.get('[aria-label="Play preview"]').click();
        cy.get('[aria-label="Preview position"]').should(($range) => {
            expect(Number($range.val())).greaterThan(0);
        });
        cy.get('[aria-label="Pause preview"]').click();
        cy.get('[aria-label="Play preview"]').should('be.enabled');
        cy.screenshot('laser-playback-preview', { capture: 'viewport' });
        cy.get('[aria-label="Reset preview"]').click();
        cy.task('clearDownloads');
        cy.contains('button', /^Save GCODE$/).click();
        cy.readDownload('.gcode').then((code) => expect(code).equal(canonical));

        cy.get('[aria-label="G-code preview"] canvas').trigger('wheel', {
            deltaY: -500,
            eventConstructor: 'WheelEvent',
        });
        cy.contains('button', /^Fit view$/)
            .click()
            .should('be.enabled');
        sampleRenderedLaser().then((sample) => {
            expect(sample.spanX).closeTo(report[0].spanX, 0.02);
            expect(sample.spanY).closeTo(report[0].spanY, 0.02);
            report.push({ phase: 'refit', ...sample });
        });
        cy.viewport(700, 900);
        cy.contains('button', /^Fit view$/)
            .click()
            .should('be.enabled');
        sampleRenderedLaser().then((sample) => {
            expect(sample.laserPixels).greaterThan(20);
            expect(Math.max(sample.spanX, sample.spanY)).greaterThan(0.09);
            report.push({ phase: 'narrow', ...sample });
        });
        cy.then(() =>
            cy.writeFile('../outputs/laser-preview-fit-render.json', {
                scope: 'Actual WebGL first-load full-power laser-colour pixels and occupied viewport spans, followed by refit and resize. No physical power or competitive performance claim.',
                report,
            }),
        );
    });
});
