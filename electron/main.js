const { app, BrowserWindow, ipcMain, safeStorage, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEV_URL = 'http://localhost:3000';
// 패키징 앱이 허용하는 file:// 범위는 정적 export 결과(out/) 폴더로 한정한다
const APP_FILE_ROOT = pathToFileURL(path.join(__dirname, '../out') + path.sep).href;

/* ── AES 키를 OS 보안 저장소로 보호 ──
   키를 암호문과 같은 localStorage 에 두면 실질 보호가 안 되므로,
   Electron safeStorage(Windows DPAPI / macOS Keychain / Linux Secret Service)로
   암호화한 뒤 사용자 데이터 폴더에 저장한다. */
const encKeyFile = () => path.join(app.getPath('userData'), 'enc-key-v1.bin');

function requireSafeStorage() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
}

// 암호화 키 IPC 는 앱 자신의 메인 프레임에서 온 요청만 처리한다
function requireAppSender(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent || !isAppUrl(frame.url)) throw new Error('허용되지 않은 요청입니다.');
}

ipcMain.handle('enc-key:get', (event) => {
  requireAppSender(event);
  requireSafeStorage();
  if (!fs.existsSync(encKeyFile())) return null;
  return safeStorage.decryptString(fs.readFileSync(encKeyFile()));
});

ipcMain.handle('enc-key:set', (event, value) => {
  requireAppSender(event);
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new Error('잘못된 암호화 키 형식입니다.');
  requireSafeStorage();
  fs.writeFileSync(encKeyFile(), safeStorage.encryptString(value));
});

function isAppUrl(url) {
  if (typeof url !== 'string') return false;
  if (!app.isPackaged) return url === DEV_URL || url.startsWith(DEV_URL + '/');
  // Windows 는 드라이브 문자 대소문자가 섞일 수 있어 대소문자 무시 비교
  return process.platform === 'win32'
    ? url.toLowerCase().startsWith(APP_FILE_ROOT.toLowerCase())
    : url.startsWith(APP_FILE_ROOT);
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

app.whenReady().then(() => {
  // 카메라·마이크·위치 등 브라우저 권한은 앱에서 쓰지 않으므로 모두 거부
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  createWindow();
});

// 모든 창이 닫히면 앱 종료 (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS: dock 아이콘 클릭 시 새 창 생성
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
