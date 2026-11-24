const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, Tray } = require('electron');

const dir = process.env.WBS_TEST_DIR;
const phase = process.env.WBS_PHASE;
const startupName = 'WBS desktop settings test ' + path.basename(dir);
const appPath = path.join(dir, 'App path with spaces');
app.setPath('userData', dir);
app.setPath('appData', dir);
app.setAppPath(appPath);
app.getName = () => startupName;
app.disableHardwareAcceleration();

let tray, trayMenu;
const setContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function (menu) {
  tray = this;
  trayMenu = menu;
  return setContextMenu.call(this, menu);
};

const startupEntry = () => app.getLoginItemSettings({path:process.execPath}).launchItems.find(item =>
  item.scope === 'user' && item.name === startupName);
function clearStartup() {
  if (process.platform === 'win32') app.setLoginItemSettings({name:startupName, openAtLogin:false});
}

if (phase !== 'second') {
  fs.mkdirSync(appPath, {recursive:true});
  fs.writeFileSync(path.join(appPath, 'index.js'), 'require(' + JSON.stringify(__filename) + ');');
}

require('../src/main');

if (phase !== 'second') {
  let expectedQuit = false;
  app.on('will-quit', () => {
    if (!expectedQuit) { console.error('Unexpected app quit.'); clearStartup(); app.exit(1); }
  });
  setTimeout(() => { console.error('Desktop settings test timed out.'); clearStartup(); app.exit(1); }, 20000).unref();

  app.whenReady().then(() => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.once('did-finish-load', async () => {
      const run = code => win.webContents.executeJavaScript(code);
      const element = id => 'document.getElementById(' + JSON.stringify(id) + ')';
      const click = id => run(element(id) + '.click()');
      async function wait(condition) {
        for (let i = 0; i < 100; i++) {
          if (await condition()) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error('Timed out waiting for desktop settings.');
      }
      const openSettings = async () => {
        await wait(() => run('document.getElementById("status").textContent === "저장소 준비됨"'));
        await click('settings-open');
        await wait(() => run(element('settings-dialog') + '.open && !' + element('close-to-tray') + '.disabled'));
      };
      const toggle = async (id, checked) => {
        await click(id);
        await wait(() => run('!' + element(id) + '.disabled && ' + element(id) + '.checked === ' + checked));
        assert.equal(await run(element('settings-error') + '.hidden'), true);
      };

      try {
        await openSettings();
        const isWindows = process.platform === 'win32';
        assert.equal(await run(element('startup-option') + '.hidden'), !isWindows);
        if (phase === 'write') {
          assert.equal(await run(element('close-to-tray') + '.checked'), false);
          if (isWindows) {
            try {
              assert.equal(await run(element('open-at-login') + '.checked'), false);
              await toggle('open-at-login', true);
              const registered = startupEntry();
              assert.equal(registered.enabled, true);
              assert.deepEqual(registered.args, [appPath]);
              await toggle('open-at-login', false);
              assert.equal(startupEntry(), undefined);
            } finally { clearStartup(); }
          }

          await toggle('close-to-tray', true);
          await click('settings-close');
          win.close();
          assert.equal(win.isDestroyed(), false);
          assert.equal(win.isVisible(), false);
          tray.emit('click');
          await wait(() => win.isVisible());
          win.close();
          assert.equal(win.isVisible(), false);
          trayMenu.items[0].click();
          await wait(() => win.isVisible());
          expectedQuit = true;
          trayMenu.items[1].click();
          console.log('Startup registration, tray hide/show, and tray quit passed.');
        } else {
          assert.equal(await run(element('close-to-tray') + '.checked'), true);
          await click('settings-close');
          win.close();
          assert.equal(win.isVisible(), false);
          const child = spawn(process.execPath, [appPath], {
            env:{...process.env, WBS_PHASE:'second'}, windowsHide:true, stdio:'ignore'
          });
          const childExit = new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', resolve);
          });
          assert.equal(await childExit, 0);
          await wait(() => win.isVisible());
          await openSettings();
          await toggle('close-to-tray', false);
          assert.equal(tray.isDestroyed(), true);
          await click('settings-close');
          expectedQuit = true;
          win.close();
          console.log('Tray preference restart, second launch, and normal close passed.');
        }
      } catch (error) {
        console.error(error);
        clearStartup();
        app.exit(1);
      }
    });
  });
}
