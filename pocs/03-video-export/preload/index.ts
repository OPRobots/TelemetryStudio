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

interface StartExportResult {
  success: boolean;
  outputPath?: string;
}

interface FinalizeResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

interface SaveResult {
  canceled: boolean;
  savedPath?: string;
  error?: string;
}

const exportAPI = {
  openTelemetry: (): Promise<FileDialogResult> =>
    ipcRenderer.invoke('dialog:openTelemetry'),

  readFile: (filePath: string): Promise<ReadFileResult> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  startExport: (config: { width: number; height: number; fps: number }): Promise<StartExportResult> =>
    ipcRenderer.invoke('export:start', config),

  writeFrame: (buffer: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('export:writeFrame', buffer),

  finalize: (): Promise<FinalizeResult> =>
    ipcRenderer.invoke('export:finalize'),

  save: (): Promise<SaveResult> =>
    ipcRenderer.invoke('export:save'),
};

contextBridge.exposeInMainWorld('exportAPI', exportAPI);

export type ExportAPI = typeof exportAPI;
