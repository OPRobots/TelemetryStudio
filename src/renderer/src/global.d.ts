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
  menuOnAction: (callback: (action: string) => void) => () => void;
  videoPrepare: (
    path: string
  ) => Promise<{
    success: boolean;
    path: string;
    transcoded: boolean;
    fps?: number;
    cancelled?: boolean;
    error?: string;
  }>;
  videoCancelPrepare: () => Promise<{ success: boolean }>;
  videoOnPrepareStatus: (
    callback: (status: { state: 'start' | 'progress' | 'end'; percent?: number; filename?: string }) => void
  ) => () => void;
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
  menuSetState: (state: {
    inspectorVisible: boolean;
    serialConnected: boolean;
    comparisonActive: boolean;
    hasVideo: boolean;
    hasData: boolean;
    checkUpdates: boolean;
  }) => void;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  settingsGetSerial: () => Promise<{
    kind: 'keyvalue' | 'csv' | 'macroarray';
    hasTimestamp: boolean;
    csvSeparator: ',' | ';' | ' ';
    csvLabels: string[];
  }>;
  settingsSetSerial: (patch: {
    kind?: 'keyvalue' | 'csv' | 'macroarray';
    hasTimestamp?: boolean;
    csvSeparator?: ',' | ';' | ' ';
    csvLabels?: string[];
  }) => Promise<void>;
  settingsGetUpdate: () => Promise<{
    consentGiven?: boolean;
    checkOnStartup: boolean;
    dismissedVersion?: string;
  }>;
  settingsSetUpdate: (patch: {
    consentGiven?: boolean;
    checkOnStartup?: boolean;
    dismissedVersion?: string;
  }) => Promise<void>;
  checkForUpdates: () => Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    url?: string;
    notes?: string;
  }>;
  exportStart: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  exportChooseDestination: (
    options?: unknown
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  exportWriteFrame: (buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  exportFinalize: () => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  exportAbort: () => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    api?: TelemetryAPI;
  }
}

export {};
