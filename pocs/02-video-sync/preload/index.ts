import { contextBridge, ipcRenderer } from 'electron';

interface FileDialogResult {
  canceled: boolean;
  filePath?: string;
}

interface ReadFileResult {
  success: boolean;
  content?: string;
  error?: string;
}

const syncAPI = {
  openVideo: (): Promise<FileDialogResult> => ipcRenderer.invoke('dialog:openVideo'),
  openTelemetry: (): Promise<FileDialogResult> => ipcRenderer.invoke('dialog:openTelemetry'),
  readFile: (filePath: string): Promise<ReadFileResult> => ipcRenderer.invoke('fs:readFile', filePath),
};

contextBridge.exposeInMainWorld('syncAPI', syncAPI);

export type SyncAPI = typeof syncAPI;
