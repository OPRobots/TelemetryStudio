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

interface SerialAPI {
  list: () => Promise<ListResult>;
  getSystemInfo: () => Promise<SystemInfo>;
}

declare global {
  interface Window {
    serialAPI: SerialAPI;
  }
}

export {};
