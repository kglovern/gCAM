const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setupUpdates } = require('./updates.cjs');

function fixture() {
    const updater = new EventEmitter();
    let checks = 0,
        downloads = 0,
        installs = 0,
        confirmation = 0;
    updater.checkForUpdates = async () => {
        checks++;
        updater.emit('checking-for-update');
    };
    updater.downloadUpdate = async () => {
        downloads++;
        updater.emit('update-downloaded');
    };
    updater.quitAndInstall = () => {
        installs++;
    };
    let invoke;
    const app = { isPackaged: true, getVersion: () => '0.1.0' };
    const updates = setupUpdates({
        app,
        autoUpdater: updater,
        ipcMain: {
            handle: (_name, handler) => {
                invoke = handler;
            },
        },
        dialog: { showMessageBox: async () => ({ response: confirmation }) },
        windows: () => [],
    });
    const frame = { url: 'gcam://app/index.html' };
    const event = { senderFrame: frame, sender: { mainFrame: frame } };
    return {
        updater,
        app,
        updates,
        invoke: (action, source = event) => invoke(source, action),
        confirm: () => {
            confirmation = 1;
        },
        counts: () => ({ checks, downloads, installs }),
    };
}
test('never downloads or installs without explicit actions and restart confirmation', async () => {
    const f = fixture();
    assert.equal(f.updater.autoDownload, false);
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    await f.updates.check();
    f.updater.emit('update-available', { version: '0.2.0' });
    assert.deepEqual(f.counts(), { checks: 1, downloads: 0, installs: 0 });
    await f.invoke('install');
    assert.equal(f.counts().installs, 0);
    await f.invoke('download');
    assert.equal((await f.invoke('status')).phase, 'ready');
    await f.invoke('install');
    assert.equal(f.counts().installs, 0);
    f.confirm();
    await f.invoke('install');
    assert.equal(f.counts().installs, 1);
});
test('rejects foreign frames and exposes an offline error without throwing', async () => {
    const f = fixture();
    await assert.rejects(
        f.invoke('download', {
            senderFrame: { url: 'https://evil.test' },
            sender: { mainFrame: {} },
        }),
    );
    f.updater.checkForUpdates = async () => {
        throw new Error('offline');
    };
    await f.updates.check();
    assert.equal((await f.invoke('status')).phase, 'error');
    f.app.isPackaged = false;
    await f.updates.check();
    assert.match((await f.invoke('status')).message, /installed application/);
});
