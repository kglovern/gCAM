it('compares identical grouped ring artwork across all fill sequences', () => {
    cy.freshProject({ tools: false });
    cy.window().then({ timeout: 120000 }, async (win) => {
        const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        );
        const { laserTravel } = await win.eval(
            "import('/src/cam/laser-order.js')",
        );
        const rect = (id, x, y, w, h, groupId) => ({
            id,
            groupId,
            points: [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h },
                { x, y },
            ],
        });
        const hash = async (text) =>
            Array.from(
                new win.Uint8Array(
                    await win.crypto.subtle.digest(
                        'SHA-256',
                        new win.TextEncoder().encode(text),
                    ),
                ),
            )
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('');
        const trials = [];
        for (const parts of [64, 256]) {
            const loops = Array.from({ length: parts }, (_, n) => {
                const group = Math.floor(n / 4),
                    within = n % 4,
                    x = (group % 8) * 50 + (within % 2) * 12,
                    y =
                        Math.floor(group / 8) * 50 +
                        Math.floor(within / 2) * 12;
                return [
                    rect('outer-' + n, x, y, 10, 10, 'group-' + group),
                    rect('hole-' + n, x + 2, y + 2, 6, 6, 'group-' + group),
                ];
            }).flat();
            for (let repeat = 0; repeat < 3; repeat++)
                for (const fillSequence of repeat % 2
                    ? ['groups', 'individual', 'all']
                    : ['all', 'individual', 'groups']) {
                    let uiCallbacks = 0;
                    const timer = win.setInterval(() => uiCallbacks++, 5),
                        controller = new win.AbortController(),
                        deadline = win.setTimeout(
                            () => controller.abort(),
                            30000,
                        );
                    try {
                        const start = win.performance.now();
                        const result = await buildToolpathGcodeAsync({
                            loops,
                            operation: 'laser-fill',
                            toolDiameter: 1,
                            cutDepth: 1,
                            laserFeed: 1200,
                            laserPower: 400,
                            laserSpot: 1,
                            laserOverscan: 0,
                            laserOptions: {
                                fillSequence,
                                hatchOverscan: false,
                            },
                            signal: controller.signal,
                        });
                        const milliseconds = win.performance.now() - start;
                        const coverage = result.toolpath.laserPaths
                            .map((path) =>
                                path.points
                                    .map((p) =>
                                        [
                                            p.x.toFixed(6),
                                            p.y.toFixed(6),
                                            p.power,
                                        ].join(','),
                                    )
                                    .sort()
                                    .join(':'),
                            )
                            .sort();
                        expect(uiCallbacks).to.be.greaterThan(0);
                        trials.push({
                            parts,
                            contours: loops.length,
                            groups: parts / 4,
                            repeat,
                            fillSequence,
                            milliseconds,
                            uiCallbacks,
                            points: result.toolpath.laserPaths.reduce(
                                (n, p) => n + p.points.length,
                                0,
                            ),
                            blankTravelMm: laserTravel(
                                result.toolpath.laserPaths,
                            ),
                            gcodeBytes: new win.Blob([result.gcode]).size,
                            coverageHash: await hash(JSON.stringify(coverage)),
                            outputHash: await hash(result.gcode),
                        });
                    } finally {
                        win.clearInterval(timer);
                        win.clearTimeout(deadline);
                    }
                }
            const subset = trials.filter((t) => t.parts === parts);
            expect(new Set(subset.map((t) => t.coverageHash)).size).to.equal(1);
            for (const mode of ['all', 'individual', 'groups'])
                expect(
                    new Set(
                        subset
                            .filter((t) => t.fillSequence === mode)
                            .map((t) => t.outputHash),
                    ).size,
                ).to.equal(1);
        }
        cy.writeFile('../outputs/laser-fill-groups-performance.json', {
            scope: 'Same 64/256 rings with holes, four rings per artwork group, default scan phase and 1 mm pitch. All/individual/groups use identical geometry and settings; order alternates over three repeats. Real request-owned CAM/output workers; wall time includes startup/transfer/output, excludes fixtures, hashing and canvas painting. Coverage/output hashes checked. Blank travel is ideal XY distance from (0,0), not acceleration time or controller throughput. Bytes/point counts are payload sizes, not peak memory or competitor measurements.',
            trials,
        });
    });
});
