import { contextBridge, ipcRenderer, webUtils } from 'electron';
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
  // === Utilidades ===
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // === Menú nativo ===
  menuOnAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string): void => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  // === Vídeo ===
  videoPrepare: (
    path: string
  ): Promise<{
    success: boolean;
    path: string;
    transcoded: boolean;
    fps?: number;
    cancelled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('video:prepare', path),
  videoCancelPrepare: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('video:cancel-prepare'),
  videoOnPrepareStatus: (
    callback: (status: { state: 'start' | 'progress' | 'end'; percent?: number; filename?: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { state: 'start' | 'progress' | 'end'; percent?: number; filename?: string }
    ): void => callback(status);
    ipcRenderer.on('video:prepare-status', handler);
    return () => ipcRenderer.removeListener('video:prepare-status', handler);
  },

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

  // === Export ===
  exportStart: (config: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:start', config),
  exportWriteFrame: (buffer: ArrayBuffer): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:writeFrame', buffer),
  exportFinalize: (): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
    ipcRenderer.invoke('export:finalize'),
  exportAbort: (): Promise<{ success: boolean }> => ipcRenderer.invoke('export:abort'),
  exportSave: (): Promise<{ canceled: boolean; savedPath?: string; error?: string }> =>
    ipcRenderer.invoke('export:save'),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}

export type TelemetryAPI = typeof api;
