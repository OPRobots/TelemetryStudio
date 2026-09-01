import { contextBridge, ipcRenderer } from 'electron';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
}

export interface TelemetryFrame {
  timestamp: number;
  accX: number;
  accY: number;
  accZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  battery: number;
}

const serialAPI = {
  listPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke('serial:list'),
  open: (path: string, baudRate: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:open', path, baudRate),
  close: (): Promise<boolean> => ipcRenderer.invoke('serial:close'),
  onFrame: (callback: (frame: TelemetryFrame) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: TelemetryFrame): void => callback(frame);
    ipcRenderer.on('serial:frame', handler);
    return () => ipcRenderer.removeListener('serial:frame', handler);
  },
  onRaw: (callback: (line: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, line: string): void => callback(line);
    ipcRenderer.on('serial:raw', handler);
    return () => ipcRenderer.removeListener('serial:raw', handler);
  },
  onDisconnected: (callback: () => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('serial:disconnected', handler);
    return () => ipcRenderer.removeListener('serial:disconnected', handler);
  },
  onError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => callback(error);
    ipcRenderer.on('serial:error', handler);
    return () => ipcRenderer.removeListener('serial:error', handler);
  }
};

contextBridge.exposeInMainWorld('serialAPI', serialAPI);

export type SerialAPI = typeof serialAPI;
