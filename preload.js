const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMenu: (handler) => {
    ipcRenderer.on('menu', (_e, action) => handler(action));
  },
  onFileOpened: (handler) => {
    ipcRenderer.on('file-opened', (_e, payload) => handler(payload));
  },
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  writeBackup: (payload) => ipcRenderer.invoke('write-backup', payload),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  aiExpand: (payload) => ipcRenderer.invoke('ai-expand-node', payload),
  exportPDF: (payload) => ipcRenderer.invoke('export-pdf', payload),
});
