const { contextBridge } = require('electron');

// Renderer process에서 Electron 환경 감지를 위한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
