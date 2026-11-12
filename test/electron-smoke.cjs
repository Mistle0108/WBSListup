const { app, BrowserWindow } = require('electron');
app.setPath('userData', process.env.PLANWEAVE_TEST_DIR);app.setPath('appData', process.env.PLANWEAVE_TEST_DIR);
require('../src/main');
app.whenReady().then(() => {
  const window = BrowserWindow.getAllWindows()[0];
  window.webContents.on('did-finish-load', async () => {
    try {
      const processPhase = JSON.stringify(process.env.PLANWEAVE_TEST_PHASE);
      const result = await window.webContents.executeJavaScript(`(async () => {
        const processPhase = ${processPhase};
        if (processPhase === 'write') await window.storage.command({op:'create',kind:'project',id:'smoke',name:'테스트'});
        if (processPhase === 'write') await window.storage.saveViewState({zoom: 3});
        return {content: await window.storage.loadContent(), view: await window.storage.loadViewState(), status: document.querySelector('#status').textContent};
      })()`);
      if (!result.content.projects.some(p => p.name === '테스트') || result.view.zoom !== 3 || result.status !== '저장소 준비됨') throw new Error(JSON.stringify(result));
      console.log('Electron 화면 및 저장 IPC 통과');
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
setTimeout(() => { console.error('실행 시간 초과'); app.exit(1); }, 15000).unref();
