const { contextBridge, ipcRenderer } = require('electron');

// Renderer process에서 Electron 환경 감지 + OS 보안 저장소 키 접근 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getEncKey: () => ipcRenderer.invoke('enc-key:get'),
  setEncKey: (value) => ipcRenderer.invoke('enc-key:set', value),
});
