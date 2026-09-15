import { contextBridge, ipcRenderer } from 'electron';

interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

interface ListResult {
  success: boolean;
  ports: PortInfo[];
  error?: string;
}

interface SystemInfo {
  platform: string;
  arch: string;
  electron: string;
  node: string;
  chrome: string;
  appVersion: string;
}

const serialAPI = {
  list: (): Promise<ListResult> => ipcRenderer.invoke('serial:list'),
  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('system:info'),
};

contextBridge.exposeInMainWorld('serialAPI', serialAPI);

export type SerialAPI = typeof serialAPI;
