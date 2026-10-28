const { app, protocol, net, BrowserWindow, ipcMain } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { assetPath } = require('./app-protocol.cjs');
const { createWindow } = require('./window.cjs');
const { createPendantService } = require('./pendant.cjs');
const { createGsenderClient } = require('./gsender.cjs');
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
        registerPendant();
        registerGsender();
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

function registerPendant() {
    const pendant = createPendantService({
        storePath: join(app.getPath('userData'), 'pendant.json'),
        onChange: (state) => {
            for (const window of BrowserWindow.getAllWindows())
                window.webContents.send('pendant:changed', state);
        },
    });
    ipcMain.handle('pendant:discover', () => pendant.discover());
    ipcMain.handle('pendant:createQr', () => pendant.createQr());
    ipcMain.handle('pendant:claim', (_event, request) =>
        pendant.claim(request),
    );
    ipcMain.handle('pendant:forget', (_event, id) => pendant.forget(id));
    ipcMain.handle('pendant:send', (_event, request) => pendant.send(request));
    app.on('will-quit', () => pendant.dispose());
}

function registerGsender() {
    const gsender = createGsenderClient();
    ipcMain.handle('gsender:ping', (_event, port) => gsender.ping(port));
    ipcMain.handle('gsender:send', (_event, request) => gsender.send(request));
}
