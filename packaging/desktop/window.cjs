const { join } = require('node:path');
const { BrowserWindow, shell, app } = require('electron');
const { APP_URL, isAppUrl, isExternalUrl } = require('./app-protocol.cjs');
const { join } = require('node:path');

function createWindow() {
    const window = new BrowserWindow({
        title: 'gCAM',
        width: 1440,
        height: 960,
        minWidth: 800,
        minHeight: 600,
        show: false,
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    });
    window.once('ready-to-show', () => {
        if (!app.commandLine.hasSwitch('smoke-test')) window.show();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
        if (isAppUrl(url)) return;
        event.preventDefault();
        if (isExternalUrl(url)) void shell.openExternal(url);
    });
    window.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
    );
    void window.loadURL(APP_URL);
    return window;
}
module.exports = { createWindow };
