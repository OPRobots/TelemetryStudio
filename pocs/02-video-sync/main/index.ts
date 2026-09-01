import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { readFile } from 'fs/promises';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// IPC Handlers
ipcMain.handle('dialog:openVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar vídeo',
    filters: [
      { name: 'Vídeo MP4', extensions: ['mp4'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('dialog:openTelemetry', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar telemetría',
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
