const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEV_URL = 'http://localhost:3000';

/* ── AES 키를 OS 보안 저장소로 보호 ──
   키를 암호문과 같은 localStorage 에 두면 실질 보호가 안 되므로,
   Electron safeStorage(Windows DPAPI / macOS Keychain / Linux Secret Service)로
   암호화한 뒤 사용자 데이터 폴더에 저장한다. */
const encKeyFile = () => path.join(app.getPath('userData'), 'enc-key-v1.bin');

function requireSafeStorage() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
}

ipcMain.handle('enc-key:get', () => {
  requireSafeStorage();
  if (!fs.existsSync(encKeyFile())) return null;
  return safeStorage.decryptString(fs.readFileSync(encKeyFile()));
});

ipcMain.handle('enc-key:set', (_event, value) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new Error('잘못된 암호화 키 형식입니다.');
  requireSafeStorage();
  fs.writeFileSync(encKeyFile(), safeStorage.encryptString(value));
});

function isAppUrl(url) {
  return app.isPackaged ? url.startsWith('file://') : url.startsWith(DEV_URL);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'PT Note',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // 프리미엄 윈도우 설정
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    show: false, // 로딩 완료 후 표시 (깜빡임 방지)
  });

  // 로딩 완료 후 윈도우 표시 (부드러운 시작)
  win.once('ready-to-show', () => {
    win.show();
  });

  // 앱 밖 주소로의 이동·새 창은 막고, http(s) 링크는 기본 브라우저로 연다
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isAppUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 개발 vs 프로덕션
  if (!app.isPackaged) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }
}

app.whenReady().then(createWindow);

// 모든 창이 닫히면 앱 종료 (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS: dock 아이콘 클릭 시 새 창 생성
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
