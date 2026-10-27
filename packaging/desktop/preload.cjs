/**
 * Purpose: Exposes the main-process tablet pairing service to the renderer as
 * window.gcamPendant. Its presence is how the UI knows it is in the desktop app.
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
