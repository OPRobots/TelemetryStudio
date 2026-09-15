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

interface ExportAPI {
  openTelemetry: () => Promise<FileDialogResult>;
  readFile: (filePath: string) => Promise<ReadFileResult>;
  startExport: (config: { width: number; height: number; fps: number }) => Promise<StartExportResult>;
  writeFrame: (buffer: ArrayBuffer) => Promise<boolean>;
  finalize: () => Promise<FinalizeResult>;
  save: () => Promise<SaveResult>;
}

declare global {
  interface Window {
    exportAPI: ExportAPI;
  }
}

export {};
