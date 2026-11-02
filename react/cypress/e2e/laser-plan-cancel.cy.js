describe('Laser planning cancellation', () => {
    it('reports real raster-row progress, aborts planning and can plan again', () => {
        cy.freshProject({ tools: false });
        cy.window().then({ timeout: 120000 }, async (win) => {
            const load = (path) => win.eval(`import(${JSON.stringify(path)})`);
            const [{ createToolpathInWorker }, { createLaserToolpath }] =
                await Promise.all([
                    load('/src/engine/cam-worker-client.ts'),
                    load('/src/cam/laser.js'),
                ]);
            const data = new win.Uint8ClampedArray(512 * 512 * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = data[i + 1] = data[i + 2] = ((i / 4) * 73) % 256;
                data[i + 3] = 255;
            }
            const config = {
                operation: 'laser-raster',
                laserFeed: 3000,
                laserPower: 750,
                laserSpot: 0.081,
                laserSMin: 0,
                laserSMax: 750,
                laserGamma: 1,
                laserOverscan: 2,
                laserOptions: { imageMode: 'jarvis' },
                sourceEntities: [
                    {
                        type: 'BITMAP',
                        bounds: {
                            minX: 0,
                            minY: 0,
                            maxX: 80,
                            maxY: 80,
                        },
                        _imageData: { width: 512, height: 512, data },
                    },
                ],
            };
            const controller = new win.AbortController();
            const progress = [];
            const result = createToolpathInWorker([], config, {
                signal: controller.signal,
                onProgress: (value) => {
                    progress.push(value);
                    if (value.percent >= 30) controller.abort();
                },
            });
            const outcome = await result.then(
                () => 'completed',
                (error) => error.name,
            );
            expect(outcome).to.equal('AbortError');
            expect(
                progress.some(
                    (p) =>
                        p.label === 'Engraving image rows' && p.percent >= 30,
                ),
            ).to.equal(true);
            const smaller = { ...config, laserSpot: 2 };
            const replacement = await createToolpathInWorker([], smaller);
            expect(replacement).not.to.have.property('sourceEntities');
            const expected = createLaserToolpath([], smaller, {
                sourceEntities: smaller.sourceEntities,
            });
            expect(
                JSON.stringify(replacement.laserPaths) ===
                    JSON.stringify(expected.laserPaths),
                'replacement geometry and power',
            ).to.equal(true);
        });
    });

    it('cancels a build from the form without adding an operation', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        cy.importDesign('contrast.png');
        cy.contains(/Bitmap .+ placed/).should('exist');
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]').type('{selectall}50');
        cy.contains('button', /^Add Toolpath/).click({
            waitForAnimations: false,
        });
        cy.contains('button', 'Cancel laser build').click({
            waitForAnimations: false,
        });
        cy.contains('Toolpath build cancelled.').should('be.visible');
        cy.contains('button', /^Add Toolpath/).should('be.enabled');
        cy.snapshot().then((project) =>
            expect(project.stack).to.have.length(0),
        );
        cy.screenshot('laser-cancelled-build', { capture: 'viewport' });
        cy.contains('button', /^Add Toolpath/).click();
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).should(
            'be.enabled',
        );
        cy.snapshot().then((project) =>
            expect(project.stack).to.have.length(1),
        );
    });
});
