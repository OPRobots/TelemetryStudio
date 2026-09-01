import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

let mainWindow: BrowserWindow | null = null;
let serialPort: SerialPort | null = null;
let parser: ReadlineParser | null = null;

const FRAME_FIELDS = ['timestamp', 'accX', 'accY', 'accZ', 'gyroX', 'gyroY', 'gyroZ', 'battery'] as const;

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

function parseFrame(line: string): TelemetryFrame | null {
  const parts = line.split(',');
  if (parts.length !== FRAME_FIELDS.length) return null;

  const values = parts.map(Number);
  if (values.some(isNaN)) return null;

  return {
    timestamp: values[0],
    accX: values[1],
    accY: values[2],
    accZ: values[3],
    gyroX: values[4],
    gyroY: values[5],
    gyroZ: values[6],
    battery: values[7]
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// IPC Handlers
ipcMain.handle('serial:list', async () => {
  const ports = await SerialPort.list();
  return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }));
});

ipcMain.handle('serial:open', async (_event, path: string, baudRate: number) => {
  try {
    serialPort = new SerialPort({ path, baudRate, autoOpen: false });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line: string) => {
      const raw = line.trim();
      if (mainWindow) {
        mainWindow.webContents.send('serial:raw', raw);
      }
      const frame = parseFrame(raw);
      if (frame && mainWindow) {
        mainWindow.webContents.send('serial:frame', frame);
      }
    });

    serialPort.on('error', (err) => {
      console.error('Serial error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('serial:error', err.message);
      }
    });

    serialPort.on('close', () => {
      if (mainWindow) {
        mainWindow.webContents.send('serial:disconnected');
      }
    });

    await new Promise<void>((resolve, reject) => {
      serialPort!.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('serial:close', async () => {
  if (serialPort && serialPort.isOpen) {
    return new Promise<boolean>((resolve) => {
      serialPort!.close((err) => {
        resolve(!err);
      });
    });
  }
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }
  app.quit();
});
