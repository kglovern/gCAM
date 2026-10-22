const { isAppUrl } = require('./app-protocol.cjs');

/** The main process owns downloads; the renderer only gets fixed update actions. */
function setupUpdates({ app, ipcMain, dialog, autoUpdater, windows }) {
    let state = { phase: 'idle', currentVersion: app.getVersion() };
    let pending = false;
    const set = (change) => {
        state = { ...state, ...change };
        for (const window of windows())
            window.webContents.send('updates:status', state);
    };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('checking-for-update', () =>
        set({ phase: 'checking', message: '' }),
    );
    autoUpdater.on('update-available', (info) =>
        set({ phase: 'available', version: info.version }),
    );
    autoUpdater.on('update-not-available', () => set({ phase: 'current' }));
    autoUpdater.on('download-progress', (progress) =>
        set({ phase: 'downloading', percent: Math.floor(progress.percent) }),
    );
    autoUpdater.on('update-downloaded', () => set({ phase: 'ready' }));
    autoUpdater.on('error', () =>
        set({
            phase: 'error',
            message:
                'Could not update. Check your connection or download the installer from GitHub Releases.',
        }),
    );

    const check = async () => {
        if (
            pending ||
            ['available', 'downloading', 'ready'].includes(state.phase)
        )
            return;
        if (!app.isPackaged) {
            set({
                phase: 'error',
                message:
                    'Update checks are available in the installed application.',
            });
            return;
        }
        pending = true;
        try {
            await autoUpdater.checkForUpdates();
        } catch {
            set({
                phase: 'error',
                message: 'Could not check for updates. Try again when online.',
            });
        } finally {
            pending = false;
        }
    };
    ipcMain.handle('updates:action', async (event, action) => {
        if (
            event.senderFrame !== event.sender.mainFrame ||
            !isAppUrl(event.senderFrame.url)
        )
            throw new Error('Updates are only available to the editor.');
        if (action === 'status') return state;
        if (action === 'check') await check();
        else if (action === 'download' && state.phase === 'available') {
            set({ phase: 'downloading', percent: 0 });
            try {
                await autoUpdater.downloadUpdate();
            } catch {
                set({
                    phase: 'error',
                    message: 'Update download failed. Try again when online.',
                });
            }
        } else if (action === 'install' && state.phase === 'ready') {
            const result = await dialog.showMessageBox({
                type: 'warning',
                title: 'Restart to update gCAM?',
                message: 'Save or export your project before restarting.',
                buttons: ['Keep editing', 'Restart and update'],
                defaultId: 0,
                cancelId: 0,
            });
            if (result.response === 1) autoUpdater.quitAndInstall(false, true);
        }
        return state;
    });
    return { check };
}
module.exports = { setupUpdates };
