import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile, mkdir, readdir, copyFile, stat, unlink } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { serialService } from './serial-service';

const LAYOUTS_DIR = (): string => join(app.getPath('userData'), 'layouts');

let serialWired = false;

function wireSerialToWindow(win: BrowserWindow): void {
  if (serialWired) return;
  serialWired = true;

  serialService.onLine((line) => {
    if (!win.isDestroyed()) win.webContents.send('serial:data', line);
  });

  serialService.onStatus((status) => {
    if (!win.isDestroyed()) win.webContents.send('serial:status', status);
  });
}

/**
 * Registra todos los handlers IPC del Main Process.
 */
export function registerIpcHandlers(win: BrowserWindow): void {
  wireSerialToWindow(win);

  // === Dialogs ===
  ipcMain.handle('dialog:openVideo', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Seleccionar vídeo',
      filters: [{ name: 'Vídeo', extensions: ['mp4', 'webm', 'mov', 'mkv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('dialog:openSession', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Abrir sesión',
      filters: [{ name: 'Sesión OPRobots', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Seleccionar carpeta',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  // === File ===
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // === Serial ===
  ipcMain.handle('serial:list', async () => {
    try {
      return await serialService.listPorts();
    } catch {
      return [];
    }
  });

  ipcMain.handle('serial:open', async (_event, path: string, baudRate: number) => {
    try {
      await serialService.open(path, baudRate);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('serial:close', async () => {
    await serialService.close();
    return { success: true };
  });

  // === Sessions ===
  ipcMain.handle('session:read', async (_event, jsonPath: string) => {
    return readFile(jsonPath, 'utf-8');
  });

  ipcMain.handle('session:getVideoPath', async (_event, jsonPath: string, videoFile: string) => {
    return join(dirname(jsonPath), videoFile);
  });

  ipcMain.handle(
    'session:export',
    async (
      _event,
      name: string,
      outputDir: string,
      jsonContent: string,
      videoPath: string
    ) => {
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sessionDir = join(outputDir, safeName);
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, 'session.json'), jsonContent, 'utf-8');
      if (videoPath) {
        try {
          await copyFile(videoPath, join(sessionDir, basename(videoPath)));
        } catch {
          // Si el vídeo ya está en la carpeta o no existe, ignorar la copia
        }
      }
      return sessionDir;
    }
  );

  ipcMain.handle('session:list', async (_event, directory: string) => {
    const sessions: Array<{ name: string; path: string; createdAt: string }> = [];
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const jsonPath = join(directory, entry.name, 'session.json');
        try {
          const s = await stat(jsonPath);
          if (!s.isFile()) continue;
          const content = await readFile(jsonPath, 'utf-8');
          const parsed = JSON.parse(content) as { name?: string; created?: string };
          sessions.push({
            name: parsed.name ?? entry.name,
            path: jsonPath,
            createdAt: parsed.created ?? s.mtime.toISOString(),
          });
        } catch {
          // No es una sesión válida
        }
      }
    } catch {
      // Directorio inexistente
    }
    return sessions;
  });

  // === Layouts ===
  ipcMain.handle('layout:save', async (_event, layout: { name: string }) => {
    const dir = LAYOUTS_DIR();
    await mkdir(dir, { recursive: true });
    const filename = `${layout.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
    await writeFile(join(dir, filename), JSON.stringify(layout, null, 2), 'utf-8');
  });

  ipcMain.handle('layout:loadAll', async () => {
    const dir = LAYOUTS_DIR();
    await mkdir(dir, { recursive: true });
    const files = await readdir(dir);
    const layouts: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(dir, file), 'utf-8');
        layouts.push(JSON.parse(content));
      } catch (error) {
        console.error(`Failed to load layout ${file}:`, error);
      }
    }
    return layouts;
  });

  ipcMain.handle('layout:delete', async (_event, name: string) => {
    const dir = LAYOUTS_DIR();
    await mkdir(dir, { recursive: true });
    const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
    await unlink(join(dir, filename)).catch(() => undefined);
  });
}
