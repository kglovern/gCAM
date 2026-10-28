const { app } = require('electron');
const { readdirSync, readFileSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');

const timeout = setTimeout(() => {
    console.error('Desktop smoke test timed out');
    app.exit(1);
}, 45000);
app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-fail-load', (_event, code, description) => {
        console.error(code, description);
        app.exit(1);
    });
    window.webContents.once('did-finish-load', async () => {
        try {
            const worker = readdirSync(join(__dirname, 'www/assets')).find(
                (name) => /^cam-worker-.*\.js$/.test(name),
            );
            if (!worker) throw new Error('Bundled CAM worker missing');
            const result =
                await window.webContents.executeJavaScript(`(async () => {
                for (let attempt = 0; attempt < 100 && (!document.querySelector('[aria-label="Main tabs"]') || document.getElementById('gcam-startup')); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
                if (!document.querySelector('[aria-label="Main tabs"]')) throw new Error('App did not render');
                if (document.getElementById('gcam-startup')) throw new Error('Startup screen did not clear');
                if (!window.gcamUpdates || typeof window.gcamUpdates.subscribe !== 'function') throw new Error('Update preload unavailable');
                const update = await window.gcamUpdates.status();
                if (!update.currentVersion || update.phase !== 'idle') throw new Error('Update bridge unavailable or smoke test contacted update server');
                if (document.body.textContent.includes('Add gCAM to your Home Screen')) throw new Error('PWA controls remain');
                if (typeof window.gcamPendant?.discover !== 'function') throw new Error('Tablet pairing bridge missing');
                if (typeof window.gcamGsender?.send !== 'function') throw new Error('gSender handoff bridge missing');
                const catalogue = await fetch('library/tools/sienci/tools.json');
                if (!catalogue.ok || !(await catalogue.text()).includes('tool')) throw new Error('Local tool catalogue unavailable');
                return await new Promise((resolve, reject) => {
                    const worker = new Worker('assets/' + ${JSON.stringify(worker)}, { type: 'module' });
                    const timer = setTimeout(() => { worker.terminate(); reject(new Error('CAM worker did not respond')); }, 15000);
                    worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
                    worker.onmessage = event => {
                        if (event.data.id !== 1 || event.data.progress) return;
                        clearTimeout(timer); worker.terminate();
                        if (event.data.error) reject(new Error(event.data.error)); else resolve('renderer, catalogue and CAM worker passed');
                    };
                    worker.postMessage({ id: 1, type: 'build-gcode', toolpaths: [], fileName: 'smoke', forcePolylineArcs: false });
                });
            })()`);
            const output = join(
                app.getPath('temp'),
                `gcam-smoke-${process.pid}.nc`,
            );
            const saved = new Promise((resolve, reject) => {
                window.webContents.session.once(
                    'will-download',
                    (_event, item) => {
                        item.setSavePath(output);
                        item.once('done', (_event, state) => {
                            try {
                                if (state !== 'completed')
                                    throw new Error(`Download ${state}`);
                                if (readFileSync(output, 'utf8') !== 'G0 X1\n')
                                    throw new Error('Export content mismatch');
                                unlinkSync(output);
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        });
                    },
                );
            });
            await window.webContents.executeJavaScript(
                `(() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['G0 X1\\n'], {type:'text/plain'})); link.download = 'gcam-smoke.nc'; link.click(); })()`,
                true,
            );
            await saved;
            console.log(
                `${result}; file export, startup and update bridge passed`,
            );
            clearTimeout(timeout);
            app.exit(0);
        } catch (error) {
            console.error(error);
            app.exit(1);
        }
    });
});
