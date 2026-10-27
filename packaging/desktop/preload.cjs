/**
 * Purpose: Exposes the main-process tablet pairing service to the renderer as
 * window.gcamPendant (its presence is how the UI knows it is in the desktop app),
 * and the installed-app update flow as window.gcamUpdates.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gcamPendant', {
    discover: () => ipcRenderer.invoke('pendant:discover'),
    createQr: () => ipcRenderer.invoke('pendant:createQr'),
    claim: (request) => ipcRenderer.invoke('pendant:claim', request),
    forget: (id) => ipcRenderer.invoke('pendant:forget', id),
    send: (request) => ipcRenderer.invoke('pendant:send', request),
    onChanged: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('pendant:changed', listener);
        return () => ipcRenderer.removeListener('pendant:changed', listener);
    },
});

contextBridge.exposeInMainWorld('gcamUpdates', {
    status: () => ipcRenderer.invoke('updates:action', 'status'),
    check: () => ipcRenderer.invoke('updates:action', 'check'),
    download: () => ipcRenderer.invoke('updates:action', 'download'),
    install: () => ipcRenderer.invoke('updates:action', 'install'),
    subscribe: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('updates:status', listener);
        return () => ipcRenderer.removeListener('updates:status', listener);
    },
});
