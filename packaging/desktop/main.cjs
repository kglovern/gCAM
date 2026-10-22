const { app, protocol, net, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { assetPath } = require('./app-protocol.cjs');
const { createWindow } = require('./window.cjs');
if (app.commandLine.hasSwitch('smoke-test')) require('./smoke-check.cjs');

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'gcam',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window) {
            if (window.isMinimized()) window.restore();
            window.focus();
        }
    });
    app.whenReady().then(() => {
        protocol.handle('gcam', (request) => {
            const file = assetPath(join(__dirname, 'www'), request.url);
            return file
                ? net.fetch(pathToFileURL(file).href)
                : new Response('Not found', { status: 404 });
        });
        const updates = require('./updates.cjs').setupUpdates({
            app,
            ipcMain: require('electron').ipcMain,
            dialog: require('electron').dialog,
            autoUpdater: require('electron-updater').autoUpdater,
            windows: () => BrowserWindow.getAllWindows(),
        });
        const window = createWindow();
        window.webContents.once('did-finish-load', () => {
            if (!app.commandLine.hasSwitch('smoke-test')) void updates.check();
        });
        app.on('activate', () => {
            if (!BrowserWindow.getAllWindows().length) createWindow();
        });
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
