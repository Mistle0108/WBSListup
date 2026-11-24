const { app, ipcMain, Menu, nativeImage, Tray } = require('electron');

const supportsStartup = process.platform === 'win32';
const trayPreference = 'close-to-tray';

async function installDesktopSettings(window, storage, iconPath, showWindow) {
  const loginItem = {
    name: app.getName(),
    path: process.execPath,
    args: process.defaultApp ? [app.getAppPath()] : []
  };
  let tray = null, quitting = false;
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    try { trayIcon = await app.getFileIcon(process.execPath, { size: 'small' }); }
    catch (error) { console.warn('시스템 트레이 아이콘을 불러오지 못했습니다.', error); }
  }

  function startupEntry() {
    return app.getLoginItemSettings(loginItem).launchItems.find(item =>
      item.name === loginItem.name && item.scope === 'user');
  }

  function settings() {
    const entry = supportsStartup ? startupEntry() : undefined;
    return {
      supportsStartup,
      openAtLogin: entry?.enabled === true && entry.args.length === loginItem.args.length &&
        entry.args.every((arg, index) => arg === loginItem.args[index]),
      closeToTray: tray !== null
    };
  }

  function createTray() {
    if (trayIcon.isEmpty()) throw new Error('시스템 트레이 아이콘을 불러오지 못했습니다.');
    const next = new Tray(trayIcon);
    try {
      next.setToolTip(app.getName());
      next.setContextMenu(Menu.buildFromTemplate([
        { label: '열기', click: showWindow },
        { label: '종료', click: () => app.quit() }
      ]));
      next.on('click', showWindow);
      return next;
    } catch (error) {
      next.destroy();
      throw error;
    }
  }

  if (storage.read(trayPreference, () => false) === true) {
    try { tray = createTray(); }
    catch (error) { console.warn('시스템 트레이를 초기화하지 못했습니다.', error); }
  }

  window.on('close', event => {
    if (!tray || quitting) return;
    event.preventDefault();
    window.hide();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { tray?.destroy(); });

  ipcMain.handle('desktop-settings:load', settings);
  ipcMain.handle('desktop-settings:set', (_event, key, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('설정 값이 올바르지 않습니다.');

    if (key === 'openAtLogin' && supportsStartup) {
      app.setLoginItemSettings({ ...loginItem, openAtLogin: enabled });
      const next = settings();
      if (next.openAtLogin !== enabled || (!enabled && startupEntry())) {
        throw new Error('Windows 자동 실행 설정을 변경하지 못했습니다.');
      }
      return next;
    }

    if (key === 'closeToTray') {
      if (enabled !== (tray !== null)) {
        const next = enabled ? createTray() : null;
        try { storage.write(trayPreference, enabled); }
        catch (error) { next?.destroy(); throw error; }
        tray?.destroy();
        tray = next;
      }
      return settings();
    }

    throw new Error('지원하지 않는 설정입니다.');
  });
}

module.exports = { installDesktopSettings };
