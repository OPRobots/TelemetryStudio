import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { readFile, copyFile, mkdir } from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let ffmpegProcess: ChildProcess | null = null;
let outputPath = '';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// IPC: Open file dialogs
ipcMain.handle('dialog:openTelemetry', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar telemetría',
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

// IPC: Read file
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

// IPC: Start FFmpeg process — receives raw RGBA frames from stdin
ipcMain.handle(
  'export:start',
  async (_event, config: { width: number; height: number; fps: number }) => {
    const outputDir = join(app.getPath('temp'), 'oprobots-poc3-export');
    await mkdir(outputDir, { recursive: true });
    outputPath = join(outputDir, `export_${Date.now()}.mp4`);

    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${config.width}x${config.height}`,
      '-r', String(config.fps),
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      '-preset', 'fast',
      '-movflags', '+faststart',
      outputPath,
    ];

    ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg spawn error:', err);
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`FFmpeg exited with code ${code}:\n${stderr}`);
      }
      ffmpegProcess = null;
    });

    return { success: true, outputPath };
  }
);

// IPC: Write raw RGBA frame to FFmpeg stdin
ipcMain.handle('export:writeFrame', async (_event, buffer: ArrayBuffer) => {
  if (!ffmpegProcess?.stdin?.writable) {
    return { success: false, error: 'FFmpeg not running' };
  }

  return new Promise<boolean>((resolve) => {
    const ok = ffmpegProcess!.stdin!.write(Buffer.from(buffer));
    if (ok) {
      resolve(true);
    } else {
      ffmpegProcess!.stdin!.once('drain', () => resolve(true));
    }
  });
});

// IPC: Finalize FFmpeg (close stdin, wait for exit)
ipcMain.handle('export:finalize', async () => {
  if (!ffmpegProcess) {
    return { success: false, error: 'No FFmpeg process' };
  }

  return new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
    ffmpegProcess!.stdin!.end();
    ffmpegProcess!.on('close', (code) => {
      ffmpegProcess = null;
      if (code === 0) {
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: `FFmpeg exited with code ${code}` });
      }
    });
  });
});

// IPC: Save dialog
ipcMain.handle('export:save', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Guardar vídeo exportado',
    defaultPath: `telemetry_export_${Date.now()}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    await copyFile(outputPath, result.filePath);
    return { canceled: false, savedPath: result.filePath };
  } catch (err) {
    return { canceled: true, error: (err as Error).message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill();
  }
  app.quit();
});
