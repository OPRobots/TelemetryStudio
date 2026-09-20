import { app, BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, copyFile } from 'fs/promises';
import { join } from 'path';
import { buildFfmpegArgs, type FfmpegArgsInput } from '../shared/export-args';
import { resolveFfmpegPath } from './ffmpeg';

let ffmpeg: ChildProcess | null = null;
let outputPath = '';

/**
 * Registra los handlers IPC de exportación de vídeo.
 * Los frames llegan como raw RGBA por `export:writeFrame` y se escriben a
 * FFmpeg por stdin (con backpressure).
 */
export function registerExportHandlers(): void {
  ipcMain.handle('export:start', async (_event, config: FfmpegArgsInput) => {
    const dir = join(app.getPath('temp'), 'oprobots-export');
    await mkdir(dir, { recursive: true });

    const ext = config.format === 'webm' ? 'webm' : 'mp4';
    outputPath = join(dir, `export_${Date.now()}.${ext}`);

    const args = buildFfmpegArgs({ ...config, outputPath });
    ffmpeg = spawn(resolveFfmpegPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] });

    ffmpeg.stderr?.on('data', () => {
      // Salida de FFmpeg descartada (progreso real lo reporta el renderer)
    });
    ffmpeg.on('error', (err) => {
      console.error('FFmpeg error:', err.message);
    });

    return { success: true };
  });

  ipcMain.handle('export:writeFrame', async (_event, buffer: ArrayBuffer) => {
    if (!ffmpeg?.stdin?.writable) {
      return { success: false, error: 'FFmpeg no está en ejecución' };
    }
    const stdin = ffmpeg.stdin;
    return new Promise<{ success: boolean }>((resolve) => {
      stdin.write(Buffer.from(buffer), () => resolve({ success: true }));
    });
  });

  ipcMain.handle('export:finalize', async () => {
    if (!ffmpeg) return { success: false, error: 'No hay proceso FFmpeg activo' };
    const process = ffmpeg;
    return new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
      process.stdin?.end();
      process.on('close', (code) => {
        ffmpeg = null;
        if (code === 0) resolve({ success: true, outputPath });
        else resolve({ success: false, error: `FFmpeg salió con código ${code}` });
      });
    });
  });

  ipcMain.handle('export:abort', async () => {
    if (ffmpeg) {
      ffmpeg.kill('SIGKILL');
      ffmpeg = null;
    }
    return { success: true };
  });

  ipcMain.handle('export:save', async (event) => {
    if (!outputPath || !existsSync(outputPath)) return { canceled: true };
    const options: SaveDialogOptions = {
      title: 'Guardar vídeo exportado',
      defaultPath: `telemetry_export_${Date.now()}.mp4`,
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
    };
    const win =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };

    try {
      await copyFile(outputPath, result.filePath);
      return { canceled: false, savedPath: result.filePath };
    } catch (err) {
      return { canceled: true, error: (err as Error).message };
    }
  });
}
