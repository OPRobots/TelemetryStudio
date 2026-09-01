interface SerialPortInfo {
  path: string;
  manufacturer?: string;
}

interface TelemetryFrame {
  timestamp: number;
  accX: number;
  accY: number;
  accZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  battery: number;
}

interface SerialAPI {
  listPorts: () => Promise<SerialPortInfo[]>;
  open: (path: string, baudRate: number) => Promise<{ success: boolean; error?: string }>;
  close: () => Promise<boolean>;
  onFrame: (callback: (frame: TelemetryFrame) => void) => () => void;
  onDisconnected: (callback: () => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
}

declare global {
  interface Window {
    serialAPI: SerialAPI;
  }
}

export {};
