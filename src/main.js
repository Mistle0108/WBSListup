const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const { Storage } = require('./storage');
const { prepareDatabase } = require('./database-path');
const { startAgentServer } = require('./agent-server');
const { installDesktopSettings } = require('./desktop-settings');
app.setName('WBS List up');
let storage, stopAgent, mainWindow;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function start() {
  const icon = path.join(__dirname, 'assets', 'checklist-folder.ico');
  const window = mainWindow = new BrowserWindow({
    icon,
    width: 1200, height: 800, minWidth: 700, minHeight: 500,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  try {
    const file = path.join(app.getPath('userData'), 'data', 'wbs-list-up.sqlite');
    const legacy = path.join(app.getPath('appData'), 'PlanWeave', 'data', 'planweave.sqlite');
    await prepareDatabase(file, legacy);
    storage = new Storage(file);
    stopAgent = await startAgentServer(storage, window, app.getPath('userData'));
    await installDesktopSettings(window, storage, icon, showMainWindow);
    ipcMain.handle('attachments:counts', () => storage.listAttachmentCounts());
    ipcMain.handle('attachments:list', (_event, kind, id) => storage.listAttachments(kind, id));
    ipcMain.handle('attachments:add', async (_event, kind, id) => {
      storage.attachmentOwner(kind, id);
      const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] });
      if (!result.canceled) for (const file of result.filePaths) storage.addAttachment(kind, id, file);
      return storage.listAttachments(kind, id);
    });
    ipcMain.handle('attachments:delete', (_event, kind, id, attachmentId) => { storage.deleteAttachment(kind, id, attachmentId); return storage.listAttachments(kind, id); });
    ipcMain.handle('attachments:open', async (_event, kind, id, attachmentId) => {
      const file = storage.attachmentPath(kind, id, attachmentId);
      const error = await shell.openPath(file.path); if (error) throw new Error(error);
    });
    ipcMain.handle('storage:load-content', () => storage.loadContentMetadata());
    ipcMain.handle('storage:load-project-document', (_event, projectId, documentId) => storage.loadProjectDocument(projectId, documentId));
    ipcMain.handle('storage:load-view', () => storage.loadViewState());
    ipcMain.handle('storage:command', (_event, command) => storage.executeContent(command));
    ipcMain.handle('storage:save-view', (_event, value) => storage.saveViewState(value));
    ipcMain.on('storage:flush-view', (event, value) => {
      try { storage.saveViewState(value); event.returnValue = null; }
      catch (error) { event.returnValue = error.message; }
    });
  } catch (error) {
    // The renderer shows the initialization failure instead of presenting empty data.
    ipcMain.handle('storage:load-content', () => { throw error; });
  }
  window.loadFile(path.join(__dirname, 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (stopAgent) stopAgent(); if (storage) storage.close(); });
}
