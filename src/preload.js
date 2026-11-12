const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storage', {
  loadContent: () => ipcRenderer.invoke('storage:load-content'),
  loadProjectDocument: (projectId, documentId) => ipcRenderer.invoke('storage:load-project-document', projectId, documentId),
  loadViewState: () => ipcRenderer.invoke('storage:load-view'),
  command: value => ipcRenderer.invoke('storage:command', value),
  saveViewState: value => ipcRenderer.invoke('storage:save-view', value),
  flushViewState: value => ipcRenderer.sendSync('storage:flush-view', value)
});
