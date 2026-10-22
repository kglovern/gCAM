const { contextBridge, ipcRenderer } = require('electron');

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
