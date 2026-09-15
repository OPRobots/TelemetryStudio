import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  serialNumber?: string;
}

export interface VideoInfo {
  filename: string;
  duration_s: number;
  fps: number;
  width: number;
  height: number;
}

export interface DialogResult {
  canceled: boolean;
  filePath?: string;
}

const api = {
  // === Dialogs ===
  dialogOpenVideo: (): Promise<DialogResult> => ipcRenderer.invoke('dialog:openVideo'),
  dialogOpenSession: (): Promise<DialogResult> => ipcRenderer.invoke('dialog:openSession'),
  dialogOpenDirectory: (): Promise<DialogResult> => ipcRenderer.invoke('dialog:openDirectory'),

  // === File ===
  readFile: (path: string): Promise<{ success: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('file:read', path),

  // === Serial ===
  serialList: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke('serial:list'),
  serialOpen: (path: string, baudRate: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:open', path, baudRate),
  serialClose: (): Promise<{ success: boolean }> => ipcRenderer.invoke('serial:close'),
  serialOnData: (callback: (line: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, line: string): void => callback(line);
    ipcRenderer.on('serial:data', handler);
    return () => ipcRenderer.removeListener('serial:data', handler);
  },
  serialOnStatus: (
    callback: (status: { connected: boolean; error?: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { connected: boolean; error?: string }
    ): void => callback(status);
    ipcRenderer.on('serial:status', handler);
    return () => ipcRenderer.removeListener('serial:status', handler);
  },

  // === Sessions ===
  sessionRead: (jsonPath: string): Promise<string> => ipcRenderer.invoke('session:read', jsonPath),
  sessionGetVideoPath: (jsonPath: string, videoFile: string): Promise<string> =>
    ipcRenderer.invoke('session:getVideoPath', jsonPath, videoFile),
  sessionExport: (
    name: string,
    outputDir: string,
    jsonContent: string,
    videoPath: string
  ): Promise<string> =>
    ipcRenderer.invoke('session:export', name, outputDir, jsonContent, videoPath),
  sessionList: (directory: string): Promise<Array<{ name: string; path: string; createdAt: string }>> =>
    ipcRenderer.invoke('session:list', directory),

  // === Layouts ===
  layoutSave: (layout: unknown): Promise<void> => ipcRenderer.invoke('layout:save', layout),
  layoutLoadAll: (): Promise<unknown[]> => ipcRenderer.invoke('layout:loadAll'),
  layoutDelete: (name: string): Promise<void> => ipcRenderer.invoke('layout:delete', name),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

export type TelemetryAPI = typeof api;
