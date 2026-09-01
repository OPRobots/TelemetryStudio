import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const api = {
  // Serial
  serialList: () => ipcRenderer.invoke('serial:list'),
  serialOpen: (path: string, baudRate: number) => ipcRenderer.invoke('serial:open', path, baudRate),
  serialClose: () => ipcRenderer.invoke('serial:close'),
  serialOnData: (callback: (data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => callback(data);
    ipcRenderer.on('serial:data', handler);
    return () => ipcRenderer.removeListener('serial:data', handler);
  },
  serialOnComplete: (callback: () => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('serial:complete', handler);
    return () => ipcRenderer.removeListener('serial:complete', handler);
  },

  // Video
  videoLoad: (path: string) => ipcRenderer.invoke('video:load', path),
  videoGetInfo: (path: string) => ipcRenderer.invoke('video:getInfo', path),

  // Sessions
  sessionExport: (name: string, outputDir: string, jsonContent: string, videoPath: string) =>
    ipcRenderer.invoke('session:export', name, outputDir, jsonContent, videoPath),
  sessionRead: (jsonPath: string) => ipcRenderer.invoke('session:read', jsonPath),
  sessionGetVideoPath: (jsonPath: string, videoFile: string) =>
    ipcRenderer.invoke('session:getVideoPath', jsonPath, videoFile),
  sessionList: (directory: string) => ipcRenderer.invoke('session:list', directory),

  // Export
  exportInit: (config: unknown) => ipcRenderer.invoke('export:init', config),
  exportWriteFrame: (index: number, imageData: ImageData) =>
    ipcRenderer.invoke('export:writeFrame', index, imageData),
  exportFinalize: () => ipcRenderer.invoke('export:finalize'),
  exportAbort: () => ipcRenderer.invoke('export:abort'),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}
