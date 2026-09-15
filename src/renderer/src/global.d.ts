import type { DashboardLayout } from '@core/types/layout';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  serialNumber?: string;
}

export interface DialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface FileReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface TelemetryAPI {
  getPathForFile: (file: File) => string;
  dialogOpenVideo: () => Promise<DialogResult>;
  dialogOpenSession: () => Promise<DialogResult>;
  dialogOpenDirectory: () => Promise<DialogResult>;
  readFile: (path: string) => Promise<FileReadResult>;
  serialList: () => Promise<SerialPortInfo[]>;
  serialOpen: (path: string, baudRate: number) => Promise<{ success: boolean; error?: string }>;
  serialClose: () => Promise<{ success: boolean }>;
  serialOnData: (callback: (line: string) => void) => () => void;
  serialOnStatus: (
    callback: (status: { connected: boolean; error?: string }) => void
  ) => () => void;
  sessionRead: (jsonPath: string) => Promise<string>;
  sessionGetVideoPath: (jsonPath: string, videoFile: string) => Promise<string>;
  sessionExport: (
    name: string,
    outputDir: string,
    jsonContent: string,
    videoPath: string
  ) => Promise<string>;
  sessionList: (
    directory: string
  ) => Promise<Array<{ name: string; path: string; createdAt: string }>>;
  layoutSave: (layout: DashboardLayout) => Promise<void>;
  layoutLoadAll: () => Promise<DashboardLayout[]>;
  layoutDelete: (name: string) => Promise<void>;
  exportStart: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  exportWriteFrame: (buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  exportFinalize: () => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  exportAbort: () => Promise<{ success: boolean }>;
  exportSave: () => Promise<{ canceled: boolean; savedPath?: string; error?: string }>;
}

declare global {
  interface Window {
    api?: TelemetryAPI;
  }
}

export {};
