describe('SVG command-preserving import performance', () => {
    it('compares the same importer with the frozen uniform sampler on identical artwork', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.readFile('src/engine/svg.js')
            .then((source) =>
                cy.window().then(async (win) => {
                    const { SVG_UNIFORM_REFERENCE } = await win.eval(
                        "import('/scripts/fixtures/svg-uniform-sampler.js')",
                    );
                    const current = await win.eval(
                        "import('/src/engine/svg.js')",
                    );
                    const anchor = source.indexOf(
                        'function sampleSvgPathPoints(',
                    );
                    expect(anchor).to.be.greaterThan(0);
                    const origin = win.location.origin;
                    const legacySource = (
                        source.slice(0, anchor) + SVG_UNIFORM_REFERENCE
                    ).replace(
                        /from '(\.\.?\/[^']+)'/g,
                        (_, path) =>
                            `from '${new URL(path, origin + '/src/engine/svg.js').href}'`,
                    );
                    const url = win.URL.createObjectURL(
                        new win.Blob([legacySource], {
                            type: 'text/javascript',
                        }),
                    );
                    try {
                        const legacy = await win.eval(
                            `import(${JSON.stringify(url)})`,
                        );
                        const results = [];
                        const d =
                            'M0 0H20Q25 0 25 5V8H18V14H25V15A5 5 0 0 1 20 20H0C-4 20 -5 17 -5 15V5S-4 0 0 0Z';
                        for (const shapes of [20, 120]) {
                            const svg =
                                '<svg xmlns="http://www.w3.org/2000/svg">' +
                                Array.from(
                                    { length: shapes },
                                    (_, i) =>
                                        `<path transform="translate(${10 + (i % 12) * 50} ${10 + Math.floor(i / 12) * 40})" d="${d}"/>`,
                                ).join('') +
                                '</svg>';
                            const bytes = new win.TextEncoder().encode(svg);
                            const digest = await win.crypto.subtle.digest(
                                'SHA-256',
                                bytes,
                            );
                            const sha256 = Array.from(
                                new Uint8Array(digest),
                                (n) => n.toString(16).padStart(2, '0'),
                            ).join('');
                            const runs = { uniform: [], commandPreserving: [] };
                            for (let round = 0; round < 7; round++) {
                                for (const mode of round % 2
                                    ? ['commandPreserving', 'uniform']
                                    : ['uniform', 'commandPreserving']) {
                                    const start = win.performance.now();
                                    const entities = (
                                        mode === 'uniform' ? legacy : current
                                    ).parseSvg(svg);
                                    const ms = win.performance.now() - start;
                                    expect(entities).to.have.length(shapes);
                                    const vertices = entities.reduce(
                                        (n, e) => n + e.vertices.length,
                                        0,
                                    );
                                    const joints = entities[0].vertices.filter(
                                        (p) =>
                                            [
                                                [30, 10],
                                                [35, 18],
                                                [28, 18],
                                                [28, 24],
                                                [35, 24],
                                            ].some(
                                                ([x, y]) =>
                                                    p.x === x && p.y === y,
                                            ),
                                    ).length;
                                    if (mode === 'commandPreserving')
                                        expect(joints).to.equal(5);
                                    runs[mode].push({
                                        ms,
                                        vertices,
                                        exactJoints: joints,
                                    });
                                }
                                await new Promise((resolve) =>
                                    win.requestAnimationFrame(resolve),
                                );
                            }
                            const modes = Object.fromEntries(
                                Object.entries(runs).map(([mode, values]) => [
                                    mode,
                                    {
                                        cold: values[0],
                                        warmups: 1,
                                        measurements: values.slice(2),
                                        medianMs: values
                                            .slice(2)
                                            .map((v) => v.ms)
                                            .sort((a, b) => a - b)[2],
                                    },
                                ]),
                            );
                            results.push({
                                shapes,
                                inputBytes: bytes.length,
                                inputSha256: sha256,
                                modes,
                            });
                        }
                        return {
                            scope: 'Identical SVG and importer; only sampler replaced. Tessellation differs intentionally to preserve joints. Browser import time only; no CAM, controller throughput, competitor or peak-memory measurement.',
                            userAgent: win.navigator.userAgent,
                            results,
                        };
                    } finally {
                        win.URL.revokeObjectURL(url);
                    }
                }),
            )
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-svg-curves-browser-benchmark.json',
                    report,
                ),
            );
    });
});
