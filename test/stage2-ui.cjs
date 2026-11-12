const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', process.env.WBS_TEST_DIR);app.setPath('appData', process.env.WBS_TEST_DIR);
require('../src/main');
app.whenReady().then(() => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('did-finish-load', async () => {
    try {
      const script = fs.readFileSync(path.join(__dirname,'stage2-ui-script.txt'),'utf8');
      const result = await win.webContents.executeJavaScript(`(${script})(${JSON.stringify(process.env.WBS_PHASE)})`);
      console.log(result); app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
setTimeout(() => { console.error('시간 초과'); app.exit(1); }, 30000).unref();
