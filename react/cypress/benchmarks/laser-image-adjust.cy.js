const dialog = '[role="dialog"][aria-label="Adjust laser image"]';
describe('Image adjustment responsiveness', () => {
    it('processes four-million-pixel previews and redraws cached images while zooming', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.window().then(async (win) => {
            const canvas = win.document.createElement('canvas');
            canvas.width = canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
            gradient.addColorStop(0, '#101010');
            gradient.addColorStop(1, '#eeeeee');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1024, 1024);
            ctx.fillStyle = '#303030';
            ctx.fillRect(100, 200, 200, 300);
            const { pngPhysicalSize } = await win.eval(
                "import('/src/platform/processedImagePng.ts')",
            );
            const bytes = pngPhysicalSize(
                Cypress.Buffer.from(
                    canvas.toDataURL('image/png').split(',')[1],
                    'base64',
                ),
                80,
                80,
            );
            cy.get('input[aria-label="Import drawing file"]').selectFile(
                {
                    contents: Cypress.Buffer.from(bytes),
                    fileName: 'inspection-capacity.png',
                    mimeType: 'image/png',
                },
                { force: true },
            );
        });
        cy.contains(/Bitmap .+ placed/).should('exist');
        cy.contains('button', /^Change$/).click();
        cy.contains('label', 'Resolution (DPI)')
            .find('input')
            .type('{selectall}63.5')
            .blur();
        cy.contains('button', 'Adjust image…').click();
        cy.get(dialog)
            .contains('button', 'Apply image settings', { timeout: 30000 })
            .should('be.enabled');
        cy.get('[aria-label="Adjustment DPI"]')
            .type('{selectall}650.24')
            .blur();
        cy.get(dialog)
            .contains('[aria-label="Processed image size"]', '2048 × 2048 px', {
                timeout: 30000,
            })
            .should('exist');
        const trials = [];
        for (const gamma of [1.1, 1.2, 1.1]) {
            let started, timer, ticks;
            cy.get('[aria-label="Adjustment gamma"]')
                .type(`{selectall}${gamma}`)
                .blur();
            cy.window().then((win) => {
                ticks = 0;
                timer = win.setInterval(() => ticks++, 5);
                started = win.performance.now();
            });
            cy.get(dialog)
                .contains('button', 'Apply image settings', { timeout: 30000 })
                .should('be.enabled');
            cy.get(`${dialog} canvas[aria-label="Processed image"]`).then(
                async ($canvas) => {
                    const canvas = $canvas[0],
                        win = canvas.ownerDocument.defaultView;
                    await new Promise((resolve) =>
                        win.requestAnimationFrame(() =>
                            win.requestAnimationFrame(resolve),
                        ),
                    );
                    const milliseconds = win.performance.now() - started;
                    win.clearInterval(timer);
                    const data = canvas
                        .getContext('2d')
                        .getImageData(0, 0, canvas.width, canvas.height).data;
                    const hash = Array.from(
                        new win.Uint8Array(
                            await win.crypto.subtle.digest('SHA-256', data),
                        ),
                    )
                        .map((n) => n.toString(16).padStart(2, '0'))
                        .join('');
                    expect(ticks).to.be.greaterThan(0);
                    trials.push({ gamma, milliseconds, ticks, hash });
                },
            );
        }
        let zoomFrames, idleFrames, zoomScales;
        cy.get(`${dialog} canvas[aria-label="Processed image"]`).then(
            async ($canvas) => {
                const canvas = $canvas[0],
                    win = canvas.ownerDocument.defaultView,
                    rect = canvas.getBoundingClientRect();
                const baseline = [];
                let idleLast = win.performance.now();
                for (let i = 0; i < 30; i++) {
                    await new Promise((resolve) =>
                        win.requestAnimationFrame(resolve),
                    );
                    const now = win.performance.now();
                    baseline.push(now - idleLast);
                    idleLast = now;
                }
                idleFrames = baseline;
                const frames = [],
                    scales = [];
                let last = win.performance.now();
                for (let i = 0; i < 30; i++) {
                    await new Promise((resolve) =>
                        win.requestAnimationFrame(resolve),
                    );
                    const now = win.performance.now();
                    frames.push(now - last);
                    last = now;
                    scales.push(JSON.parse(canvas.dataset.view).scale);
                    canvas.dispatchEvent(
                        new win.WheelEvent('wheel', {
                            deltaY: i % 2 ? 20 : -20,
                            clientX: rect.left + rect.width / 2,
                            clientY: rect.top + rect.height / 2,
                            bubbles: true,
                            cancelable: true,
                        }),
                    );
                }
                zoomFrames = frames;
                zoomScales = scales;
            },
        );
        cy.get(dialog).contains('Processing image…').should('not.exist');
        cy.then(() => {
            expect(trials[0].hash).to.equal(trials[2].hash);
            expect(trials[0].hash).not.to.equal(trials[1].hash);
            expect(
                Math.max(...zoomScales) - Math.min(...zoomScales),
            ).to.be.greaterThan(0.0001);
            return cy.writeFile(
                '../outputs/laser-image-adjust-performance.json',
                {
                    sourcePixels: 1048576,
                    processedPixels: 4194304,
                    trials,
                    zoomFrames,
                    idleFrames,
                    zoomScales,
                },
            );
        });
        cy.get(dialog)
            .contains('button', /^Cancel$/)
            .click();
    });
});
