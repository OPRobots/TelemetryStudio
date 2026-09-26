import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
} from 'electron';
import { readFile, writeFile, mkdir, readdir, copyFile, stat, unlink } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { serialService } from './serial-service';
import {
  getSerialSettings,
  getUpdateSettings,
  setSerialSettings,
  setUpdateSettings,
  type SerialSettings,
  type UpdateSettings,
} from './settings-store';

const LAYOUTS_DIR = (): string => join(app.getPath('userData'), 'layouts');

let serialWired = false;

/**
 * Difunde un evento a todas las ventanas abiertas. La app usa una sola ventana,
 * pero en macOS puede reabrirse tras cerrarla, así que no capturamos una
 * instancia concreta.
 */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function wireSerial(): void {
  if (serialWired) return;
  serialWired = true;

  serialService.onLine((line) => broadcast('serial:data', line));
  serialService.onStatus((status) => broadcast('serial:status', status));
}

/** Ventana que originó la llamada IPC (para diálogos modales). */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function openDialog(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  const win = senderWindow(event);
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

/**
 * Registra todos los handlers IPC del Main Process. Se llama una sola vez
 * (registrar de nuevo lanzaría un error de "second handler").
 */
export function registerIpcHandlers(): void {
  wireSerial();

  // === App ===
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('open-external', async (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  });

  // === Ajustes ===
  ipcMain.handle('settings:getSerial', () => getSerialSettings());
  ipcMain.handle('settings:setSerial', (_event, patch: Partial<SerialSettings>) => {
    if (patch && typeof patch === 'object') setSerialSettings(patch);
  });
  ipcMain.handle('settings:getUpdate', () => getUpdateSettings());
  ipcMain.handle('settings:setUpdate', (_event, patch: Partial<UpdateSettings>) => {
    if (patch && typeof patch === 'object') setUpdateSettings(patch);
  });

  // === Dialogs ===
  ipcMain.handle('dialog:openVideo', async (event) => {
    const result = await openDialog(event, {
      title: 'Seleccionar vídeo',
      filters: [{ name: 'Vídeo', extensions: ['mp4', 'webm', 'mov', 'mkv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('dialog:openSession', async (event) => {
    const result = await openDialog(event, {
      title: 'Abrir sesión',
      filters: [{ name: 'Sesión Telemetry Studio', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('dialog:openDirectory', async (event) => {
    const result = await openDialog(event, {
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
