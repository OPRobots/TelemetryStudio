import { BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { mkdir, rm } from 'fs/promises';
import { dirname } from 'path';
import { buildFfmpegArgs, type FfmpegArgsInput } from '../shared/export-args';
import { resolveFfmpegPath } from './ffmpeg';

let ffmpeg: ChildProcess | null = null;
let outputPath = '';

/** Borra el fichero de salida parcial (al abortar o si FFmpeg falla). */
async function removePartialOutput(): Promise<void> {
  if (!outputPath) return;
  const pending = outputPath;
  outputPath = '';
  await rm(pending, { force: true }).catch(() => undefined);
}

/**
 * Registra los handlers IPC de exportación de vídeo.
 * Los frames llegan como raw RGBA por `export:writeFrame` y se escriben a
 * FFmpeg por stdin (con backpressure). El vídeo se escribe **directamente** en
 * la ruta elegida por el usuario (sin temporales intermedios).
 */
export function registerExportHandlers(): void {
  // Diálogo nativo de "guardar como" para elegir destino y nombre.
  ipcMain.handle('export:choose-destination', async (event, options?: { defaultName?: string }) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
    const dialogOptions: SaveDialogOptions = {
      title: 'Exportar vídeo',
      defaultPath: options?.defaultName ?? `telemetria_${Date.now()}.mp4`,
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(
    'export:start',
    async (_event, config: FfmpegArgsInput & { outputPath?: string }) => {
      if (!config?.outputPath) return { success: false, error: 'Falta la ruta de salida' };
      outputPath = config.outputPath;
      await mkdir(dirname(outputPath), { recursive: true });

      const args = buildFfmpegArgs({ ...config, outputPath });
      ffmpeg = spawn(resolveFfmpegPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] });

      ffmpeg.stderr?.on('data', () => {
        // Salida de FFmpeg descartada (progreso real lo reporta el renderer)
      });
      // Sin estos handlers, un `write` a un FFmpeg que ya cerró (p. ej. tras
      // cancelar) emitiría un `EPIPE` como excepción no capturada en el main.
      ffmpeg.stdin?.on('error', (err) => {
        console.error('FFmpeg stdin error:', err.message);
      });
      ffmpeg.on('error', (err) => {
        console.error('FFmpeg error:', err.message);
      });

      return { success: true };
    }
  );

  ipcMain.handle('export:writeFrame', async (_event, buffer: ArrayBuffer) => {
    const stdin = ffmpeg?.stdin;
    if (!stdin || !stdin.writable || stdin.destroyed) {
      return { success: false, error: 'FFmpeg no está en ejecución' };
    }
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      try {
        stdin.write(Buffer.from(buffer), (err) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      } catch (err) {
        resolve({ success: false, error: (err as Error).message });
      }
    });
  });

  ipcMain.handle('export:finalize', async () => {
    if (!ffmpeg) return { success: false, error: 'No hay proceso FFmpeg activo' };
    const process = ffmpeg;
    return new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
      process.stdin?.end();
      process.on('close', (code) => {
        ffmpeg = null;
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          void removePartialOutput().then(() =>
            resolve({ success: false, error: `FFmpeg salió con código ${code}` })
          );
        }
      });
    });
  });

  ipcMain.handle('export:abort', async () => {
    if (ffmpeg) {
      ffmpeg.kill('SIGKILL');
      ffmpeg = null;
    }
    await removePartialOutput();
    return { success: true };
  });
}
