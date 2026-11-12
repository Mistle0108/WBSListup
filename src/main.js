const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { Storage } = require('./storage');
const { prepareDatabase } = require('./database-path');
const { startAgentServer } = require('./agent-server');
app.setName('WBS List up');
let storage, stopAgent;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1200, height: 800, minWidth: 700, minHeight: 500,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  try {
    const file = path.join(app.getPath('userData'), 'data', 'wbs-list-up.sqlite');
    const legacy = path.join(app.getPath('appData'), 'PlanWeave', 'data', 'planweave.sqlite');
    await prepareDatabase(file, legacy);
    storage = new Storage(file);
    stopAgent = await startAgentServer(storage, window, app.getPath('userData'));
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
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (stopAgent) stopAgent(); if (storage) storage.close(); });
