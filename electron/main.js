const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'PT Note',
    webPreferences: {
      contextIsolation: true,
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

  // 개발 vs 프로덕션
  if (!app.isPackaged) {
    win.loadURL('http://localhost:3000');
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
