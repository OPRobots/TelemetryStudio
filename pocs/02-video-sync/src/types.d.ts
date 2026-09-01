interface FileDialogResult {
  canceled: boolean;
  filePath?: string;
}

interface ReadFileResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface SyncAPI {
  openVideo: () => Promise<FileDialogResult>;
  openTelemetry: () => Promise<FileDialogResult>;
  readFile: (filePath: string) => Promise<ReadFileResult>;
}

declare global {
  interface Window {
    syncAPI: SyncAPI;
  }
}

export {};
