const path = (id, xy, extra = {}) => ({
    id,
    layerId: 'default',
    points: xy.map(([x, y]) => ({ x, y })),
    ...extra,
});
const square = [
    [100, 100],
    [140, 100],
    [140, 140],
    [100, 140],
    [100, 100],
];
const base = () => ({
    loops: [
        path('square', square),
        path('reverse', [
            [140, 140],
            [140, 100],
            [100, 100],
            [100, 140],
            [140, 140],
        ]),
        path('resampled', [
            [120, 100],
            [140, 100],
            [140, 140],
            [100, 140],
            [100, 100],
            [120, 100],
        ]),
        path('unique', [
            [170, 100],
            [200, 100],
            [200, 140],
            [170, 100],
        ]),
        path('line', [
            [100, 160],
            [140, 170],
        ]),
        path('line-copy', [
            [140, 170],
            [120, 165],
            [100, 160],
        ]),
        path('cross-layer', square, { layerId: 'other' }),
        path('group-a', square, { groupId: 'g1' }),
        path('group-b', square, { groupId: 'g2' }),
        path('hidden', square),
    ],
    selected: [],
    hidden: ['hidden'],
    stack: [],
    bitmaps: [],
    guides: [],
    fileName: 'Duplicate outlines',
    layers: [
        { id: 'default', name: 'Default' },
        { id: 'other', name: 'Other', color: '#dd6600' },
    ],
    activeLayerId: 'default',
    stock: {
        widthMm: 300,
        heightMm: 300,
        thicknessMm: 3,
        material: 'sheet-goods',
        laserMaterial: 'plywood',
        origin: 'front-left',
    },
});
function load(snapshot) {
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    fileName: snapshot.fileName,
                    snapshot,
                }),
            ),
            fileName: 'duplicates.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
}
describe('Duplicate outline cleanup', () => {
    it('reviews duplicates, preserves skipped artwork and unrelated jobs, and exports through undo/reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false, multipleSelection: false });
        cy.get('[aria-label="Laser"]').click();
        let before;
        cy.window()
            .then(async (win) => {
                const snapshot = base(),
                    canvas = win.document.createElement('canvas');
                canvas.width = 2;
                canvas.height = 2;
                canvas.getContext('2d').fillRect(0, 0, 2, 2);
                snapshot.bitmaps = [
                    {
                        id: 'image',
                        x: 210,
                        y: 100,
                        w: 10,
                        h: 10,
                        dataUrl: canvas.toDataURL('image/png'),
                    },
                ];
                snapshot.loops.push(
                    path(
                        'image-loop',
                        [
                            [210, 100],
                            [220, 100],
                            [220, 110],
                            [210, 110],
                            [210, 100],
                        ],
                        { bitmapId: 'image' },
                    ),
                );
                const { buildToolpathGcodeAsync } = await win.eval(
                    "import('/src/lib/engine.ts')",
                );
                const jobs = [
                    ['keeper', [snapshot.loops[0]]],
                    ['duplicate', [snapshot.loops[1]]],
                    ['mixed', [snapshot.loops[4], snapshot.loops[5]]],
                    ['unrelated', [snapshot.loops[3]]],
                ];
                for (const [id, loops] of jobs) {
                    const args = {
                        loops,
                        operation: 'laser-cut',
                        toolDiameter: 0.1,
                        cutDepth: 1,
                        laserFeed: 1000,
                        laserPower: 300,
                        laserSpot: 0.1,
                    };
                    const result = await buildToolpathGcodeAsync(args);
                    snapshot.stack.push({
                        id,
                        label: id,
                        customLabel: id,
                        args,
                        preview: result.previewContours.map((points) => ({
                            points,
                        })),
                        toolpath: { ...result.toolpath, id, label: id },
                    });
                }
                return snapshot;
            })
            .then(load);
        cy.snapshot().then((p) => {
            before = p;
        });
        cy.menu('Edit', 'Delete duplicates…');
        cy.contains('3 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('7 shapes compared · 3 skipped').should('be.visible');
        cy.contains('2 related toolpaths will be removed').should('be.visible');
        cy.contains('label', 'Compare across layers').find('input').check();
        cy.contains('4 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('label', 'Compare across layers').find('input').uncheck();
        cy.contains('3 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains('button', /^Cancel$/).click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.deep.equal(before.loops);
            expect(p.stack).to.deep.equal(before.stack);
        });
        cy.menu('Edit', 'Delete duplicates…');
        cy.contains('3 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.screenshot('laser-delete-duplicates', { capture: 'viewport' });
        cy.contains(
            'aside button:not([aria-label])',
            /^Delete duplicates$/,
        ).click();
        const verify = (p) => {
            expect(p.loops.map((s) => s.id)).to.deep.equal(
                before.loops
                    .filter(
                        (s) =>
                            !['reverse', 'resampled', 'line-copy'].includes(
                                s.id,
                            ),
                    )
                    .map((s) => s.id),
            );
            expect(p.stack).to.deep.equal(
                before.stack.filter((s) =>
                    ['keeper', 'unrelated'].includes(s.id),
                ),
            );
            expect(p.bitmaps).to.deep.equal(before.bitmaps);
            expect(p.hidden).to.deep.equal(before.hidden);
            expect(p.selected).to.deep.equal(['square', 'line']);
        };
        cy.snapshot().then(verify);
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.deep.equal(before.loops);
            expect(p.stack).to.deep.equal(before.stack);
        });
        cy.get('[aria-label="Redo"]').click();
        cy.snapshot().then((p) => {
            verify(p);
            load(p);
        });
        cy.contains('Loaded duplicates.gcam.json').should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack).to.deep.equal(
                before.stack.filter((s) =>
                    ['keeper', 'unrelated'].includes(s.id),
                ),
            );
            expect(p.loops).to.have.length(8);
        });
        cy.worldClick(160, 150);
        cy.get('[aria-label="Name keeper"]', { timeout: 30000 }).should(
            'exist',
        );
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S300');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
    it('switches correctly from repair mode and refuses to delete from a stale drawing', () => {
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        const snapshot = base();
        snapshot.loops = [
            path('a', [
                [100, 100],
                [140, 100],
            ]),
            path('b', [
                [140, 100],
                [100, 100],
            ]),
        ];
        snapshot.selected = ['a'];
        snapshot.hidden = [];
        load(snapshot);
        cy.menu('Edit', 'Repair paths…');
        cy.get('[aria-label="Path repair mode"]').should('be.visible');
        cy.menu('Edit', 'Delete duplicates…');
        cy.get('[aria-label="Path repair mode"]').should('not.exist');
        cy.contains('1 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.get('[data-testid="gcam-canvas"]')
            .focus()
            .trigger('keydown', { key: 'ArrowRight' });
        cy.contains(
            'aside button:not([aria-label])',
            /^Delete duplicates$/,
        ).click();
        cy.contains('[role="alert"]', 'Source shapes changed').should(
            'be.visible',
        );
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(2);
            expect(p.loops[0].points[0].x).to.equal(101);
        });
        cy.get('[aria-label="Close duplicate review"]').click();
        cy.menu('Edit', 'Delete duplicates…');
        cy.contains('0 duplicate shapes found', { timeout: 30000 }).should(
            'be.visible',
        );
        cy.contains(
            'aside button:not([aria-label])',
            /^Delete duplicates$/,
        ).should('be.disabled');
    });
    it('finds 10,000 rotated/reversed duplicates in an actual worker with reproducible results', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then(async (win) => {
                const { repairPathsInWorker } = await win.eval(
                    "import('/src/engine/cam-worker-client.ts')",
                );
                const shapes = [];
                for (let i = 0; i < 10000; i++) {
                    const x = (i % 100) * 3,
                        y = Math.floor(i / 100) * 3,
                        ring = [
                            [x, y],
                            [x + 2, y],
                            [x + 2, y + 2],
                            [x, y + 2],
                        ];
                    shapes.push(
                        path('keep-' + i, [...ring, ring[0]]),
                        path('copy-' + i, [
                            ring[2],
                            ring[1],
                            ring[0],
                            ring[3],
                            ring[2],
                        ]),
                    );
                }
                const trials = [];
                for (let i = 0; i < 3; i++) {
                    let ticks = 0;
                    const timer = win.setInterval(() => ticks++, 5),
                        started = win.performance.now();
                    const result = await repairPathsInWorker({
                        shapes,
                        mode: 'duplicates',
                        closure: 'line',
                        tolerance: 0.05,
                    }).promise;
                    const ms = win.performance.now() - started;
                    win.clearInterval(timer);
                    expect(result.duplicates).to.equal(10000);
                    expect(result.shapes).to.have.length(10000);
                    expect(ticks).to.be.greaterThan(0);
                    const hash = Array.from(
                        new win.Uint8Array(
                            await win.crypto.subtle.digest(
                                'SHA-256',
                                new win.TextEncoder().encode(
                                    JSON.stringify(result.shapes),
                                ),
                            ),
                        ),
                    )
                        .map((n) => n.toString(16).padStart(2, '0'))
                        .join('');
                    trials.push({ milliseconds: ms, ticks, hash });
                }
                expect(new Set(trials.map((t) => t.hash)).size).to.equal(1);
                return {
                    sourceShapes: 20000,
                    sourcePoints: 100000,
                    duplicates: 10000,
                    outputShapes: 10000,
                    trials,
                    userAgent: win.navigator.userAgent,
                };
            })
            .then((report) =>
                cy.writeFile('../outputs/laser-duplicates-worker.json', report),
            );
    });
});
