const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storage', {
  loadDesktopSettings: () => ipcRenderer.invoke('desktop-settings:load'),
  setDesktopSetting: (key, enabled) => ipcRenderer.invoke('desktop-settings:set', key, enabled),
  listAttachmentCounts: () => ipcRenderer.invoke('attachments:counts'),
  listAttachments: (kind, id) => ipcRenderer.invoke('attachments:list', kind, id),
  addAttachments: (kind, id) => ipcRenderer.invoke('attachments:add', kind, id),
  deleteAttachment: (kind, id, attachmentId) => ipcRenderer.invoke('attachments:delete', kind, id, attachmentId),
  openAttachment: (kind, id, attachmentId) => ipcRenderer.invoke('attachments:open', kind, id, attachmentId),
  loadContent: () => ipcRenderer.invoke('storage:load-content'),
  loadProjectDocument: (projectId, documentId) => ipcRenderer.invoke('storage:load-project-document', projectId, documentId),
  loadViewState: () => ipcRenderer.invoke('storage:load-view'),
  command: value => ipcRenderer.invoke('storage:command', value),
  saveViewState: value => ipcRenderer.invoke('storage:save-view', value),
  flushViewState: value => ipcRenderer.sendSync('storage:flush-view', value)
});
