const path = (id, xy) => ({ id, points: xy.map(([x, y]) => ({ x, y })) });
const fragments = [
    path('a', [
        [100, 100],
        [140, 100],
    ]),
    path('b', [
        [140.02, 100],
        [140, 140],
    ]),
    path('c', [
        [140, 140.02],
        [100, 140],
    ]),
    path('d', [
        [100, 140.02],
        [100.02, 100],
    ]),
];
const base = () => ({
    loops: [
        ...fragments,
        path('closed', [
            [170, 100],
            [190, 100],
            [190, 120],
            [170, 100],
        ]),
        path('hidden', [
            [200, 100],
            [220, 110],
        ]),
    ],
    selected: [],
    hidden: ['hidden'],
    stack: [],
    bitmaps: [],
    guides: [],
    fileName: 'Repair drawing',
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
            fileName: 'repair.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
}
describe('Laser open-path repair', () => {
    it('selects visible open shapes, stages/cancels joins, then fills the repaired shape through undo and reload', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
        cy.get('[aria-label="Laser"]').click();
        const original = base();
        load(original);
        cy.menu('Edit', 'Select open shapes');
        cy.snapshot().then((p) =>
            expect(p.selected).to.deep.equal(['a', 'b', 'c', 'd']),
        );
        cy.menu('Edit', 'Repair paths…');
        cy.contains('4 open shapes · 3 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.snapshot().then((p) =>
            expect(p.loops).to.deep.equal(original.loops),
        );
        cy.contains('button', /^Cancel$/).click();
        cy.snapshot().then((p) =>
            expect(p.loops).to.deep.equal(original.loops),
        );
        cy.menu('Edit', 'Repair paths…');
        cy.contains('4 open shapes · 3 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.screenshot('laser-path-repair', { capture: 'viewport' });
        cy.contains('button', 'Apply repair').click();
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(3);
            expect(p.loops[0].points).to.have.length(5);
            expect(p.loops[0].points[0]).to.deep.equal(p.loops[0].points[4]);
            expect(p.loops[1]).to.deep.equal(original.loops[4]);
            expect(p.loops[2]).to.deep.equal(original.loops[5]);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.snapshot().then((p) =>
            expect(p.loops).to.deep.equal(original.loops),
        );
        cy.get('[aria-label="Redo"]').click();
        cy.contains('button', /^Laser Fill$/).click();
        cy.contains('button', /^Change$/).click();
        cy.get('[aria-label="Laser power percent"]')
            .type('{selectall}25')
            .blur();
        cy.contains('button', /^Add Toolpath/).click();
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.snapshot().then((p) => {
            expect(p.stack).to.have.length(1);
            expect(p.stack[0].args.loops).to.have.length(1);
            load(p);
        });
        cy.get('input[aria-label^="Name Laser Fill"]', {
            timeout: 30000,
        }).should('exist');
        cy.task('clearDownloads');
        cy.contains('button:not([role="menuitem"])', /^Export G-code$/).click();
        cy.readDownload('.gcode').then((code) => {
            expect(code).to.include('S250');
            expect(code).not.to.match(/M6|G[01] Z/);
        });
    });
    it('closes a small gap with either method and rejects applying a stale source', () => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false, multipleSelection: false });
        cy.get('[aria-label="Laser"]').click();
        const snapshot = base();
        snapshot.loops = [
            path('gap', [
                [100, 100],
                [140, 100],
                [140, 140],
                [100.2, 100],
            ]),
        ];
        snapshot.selected = ['gap'];
        load(snapshot);
        cy.menu('Edit', 'Repair paths…');
        cy.get('[aria-label="Path repair mode"]').select('close');
        cy.contains('1 open shapes · 0 joins · 0 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.contains('button', 'Apply repair').should('be.disabled');
        cy.get('[aria-label="Path repair tolerance"]')
            .type('{selectall}0.3')
            .blur();
        cy.contains('1 open shapes · 0 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.get('[aria-label="Path closure method"]').select('move');
        cy.contains('1 open shapes · 0 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.contains('button', 'Apply repair').click();
        cy.snapshot().then((p) => {
            expect(p.loops[0].points).to.have.length(4);
            expect(p.loops[0].points[0].x).to.be.closeTo(100.1, 1e-8);
        });
        cy.get('[aria-label="Undo"]').click();
        cy.menu('Edit', 'Repair paths…');
        cy.get('[aria-label="Path repair mode"]').select('close');
        cy.get('[aria-label="Path repair tolerance"]')
            .type('{selectall}0.3')
            .blur();
        cy.contains('1 open shapes · 0 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.contains('button', 'Apply repair').click();
        cy.snapshot().then((p) => expect(p.loops[0].points).to.have.length(5));
        cy.get('[aria-label="Undo"]').click();
        cy.menu('Edit', 'Repair paths…');
        cy.get('[aria-label="Path repair mode"]').select('close');
        cy.get('[aria-label="Path repair tolerance"]')
            .type('{selectall}0.3')
            .blur();
        cy.contains('1 open shapes · 0 joins · 1 closed', {
            timeout: 30000,
        }).should('be.visible');
        cy.get('[data-testid="gcam-canvas"]')
            .focus()
            .trigger('keydown', { key: 'ArrowRight' });
        cy.contains('button', 'Apply repair').click();
        cy.contains('[role="alert"]', 'Source shapes changed').should(
            'be.visible',
        );
        cy.snapshot().then((p) => {
            expect(p.loops[0].points).to.have.length(4);
            expect(p.loops[0].points[0].x).to.equal(101);
        });
    });
    it('joins 10,000 fragments in a real worker while the UI remains responsive', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then(async (win) => {
                const { repairPathsInWorker } = await win.eval(
                    "import('/src/engine/cam-worker-client.ts')",
                );
                const shapes = Array.from({ length: 10000 }, (_, i) =>
                    path(
                        'p' + i,
                        i % 2
                            ? [
                                  [i * 5 + 4.98, 0],
                                  [i * 5, 0],
                              ]
                            : [
                                  [i * 5, 0],
                                  [i * 5 + 4.98, 0],
                              ],
                    ),
                );
                const trials = [];
                for (let i = 0; i < 3; i++) {
                    let ticks = 0;
                    const timer = win.setInterval(() => ticks++, 5),
                        started = win.performance.now();
                    const result = await repairPathsInWorker({
                        shapes,
                        mode: 'join',
                        tolerance: 0.05,
                        closure: 'line',
                    }).promise;
                    const ms = win.performance.now() - started;
                    win.clearInterval(timer);
                    expect(result.joined).to.equal(9999);
                    expect(result.shapes).to.have.length(1);
                    expect(result.shapes[0].points).to.have.length(10001);
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
                    sourceShapes: 10000,
                    sourcePoints: 20000,
                    outputShapes: 1,
                    outputPoints: 10001,
                    trials,
                    userAgent: win.navigator.userAgent,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-path-repair-worker.json',
                    report,
                ),
            );
    });
});
