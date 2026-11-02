const guide = (id, y) => ({
    id,
    point: { x: 0, y },
    direction: { x: 1, y: 0 },
});
const snapshot = (name, y) => ({
    loops: [],
    selected: [],
    hidden: [],
    stack: [],
    bitmaps: [],
    guides: [guide(name, y)],
    fileName: name,
    stock: {
        widthMm: 100,
        heightMm: 100,
        thicknessMm: 3,
        material: 'sheet-goods',
        origin: 'front-left',
    },
});
it('keeps a newly opened project when an older startup recovery finishes late', () => {
    cy.viewport(1280, 720);
    cy.freshProject({ tools: false });
    const old = snapshot('Old recovery', 20),
        fresh = snapshot('Fresh import', 45);
    cy.window().then(async (win) => {
        const { ProjectAutosaveStore } = await win.eval(
            "import('/src/lib/autosave.ts')",
        );
        await new ProjectAutosaveStore().save(old);
    });
    cy.visit('/', {
        onBeforeLoad(win) {
            const get = win.IDBObjectStore.prototype.get;
            win.IDBObjectStore.prototype.get = function (key) {
                const request = get.call(this, key);
                if (this.name === 'projects' && key === 'active-project') {
                    Object.defineProperty(request, 'onsuccess', {
                        configurable: true,
                        set(handler) {
                            request.addEventListener('success', (event) => {
                                win.releaseStartupRecovery = () =>
                                    handler.call(request, event);
                            });
                        },
                    });
                }
                return request;
            };
        },
    });
    cy.window()
        .its('releaseStartupRecovery', { timeout: 30000 })
        .should('be.a', 'function');
    cy.get('input[aria-label="Import project file"]').selectFile(
        {
            contents: Cypress.Buffer.from(
                JSON.stringify({
                    kind: 'gcam.project',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    fileName: 'Fresh import',
                    snapshot: fresh,
                }),
            ),
            fileName: 'fresh.gcam.json',
            mimeType: 'application/json',
        },
        { force: true },
    );
    cy.contains('Loaded fresh.gcam.json.').should('exist');
    cy.window().then((win) => win.releaseStartupRecovery());
    cy.snapshot().then((p) => {
        expect(p.guides).to.deep.equal(fresh.guides);
        expect(p.stock.widthMm).to.equal(100);
    });
    cy.contains('Recovered the last local project.').should('not.exist');
    cy.window().then(async (win) => {
        const { ProjectAutosaveStore } = await win.eval(
            "import('/src/lib/autosave.ts')",
        );
        const store = new ProjectAutosaveStore();
        // Only the startup read is held; release later verification reads normally.
        const proto = win.IDBObjectStore.prototype,
            heldGet = proto.get;
        proto.get = function (key) {
            const request = heldGet.call(this, key);
            delete request.onsuccess;
            return request;
        };
        const deadline = Date.now() + 10000;
        let saved;
        do {
            saved = await store.load();
            if (saved?.snapshot.guides[0]?.id === 'Fresh import') break;
            await new Promise((resolve) => win.setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        expect(saved.snapshot.guides).to.deep.equal(fresh.guides);
    });
});
