import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('serial:list', async () => {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return { success: true, ports };
  } catch (err) {
    return { success: false, error: (err as Error).message, ports: [] };
  }
});

ipcMain.handle('system:info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    appVersion: app.getVersion(),
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
