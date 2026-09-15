import { app, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { basename, extname, join } from 'path';
import { isPlayableVideoCodec } from '../shared/video-codecs';
import { buildTranscodeArgs } from '../shared/video-transcode';
import { resolveFfmpegPath, resolveFfprobePath } from './ffmpeg';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(binary: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Devuelve el códec de vídeo de un archivo, o null si no se puede leer. */
export async function probeVideoCodec(path: string): Promise<string | null> {
  try {
    const result = await run(resolveFfprobePath(), [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'csv=p=0',
      path,
    ]);
    if (result.code !== 0) return null;
    return result.stdout.trim().split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Comprueba si un vídeo es reproducible en Chromium. Si no (p. ej. HEVC/H.265),
 * lo transcodea a H.264 con FFmpeg (sidecar o del PATH) y devuelve la nueva ruta.
 */
export async function prepareVideo(path: string): Promise<{ path: string; transcoded: boolean }> {
  const codec = await probeVideoCodec(path);
  if (isPlayableVideoCodec(codec)) {
    return { path, transcoded: false };
  }

  const dir = join(app.getPath('temp'), 'oprobots-video');
  await mkdir(dir, { recursive: true });
  const output = join(dir, `${basename(path, extname(path))}.h264.mp4`);

  const result = await run(resolveFfmpegPath(), buildTranscodeArgs({ inputPath: path, outputPath: output }));

  if (result.code !== 0) {
    throw new Error(`FFmpeg no pudo convertir el vídeo (código ${result.code})`);
  }
  return { path: output, transcoded: true };
}

export function registerVideoHandlers(): void {
  ipcMain.handle('video:prepare', async (_event, path: string) => {
    try {
      const prepared = await prepareVideo(path);
      return { success: true, ...prepared };
    } catch (err) {
      return { success: false, path, transcoded: false, error: (err as Error).message };
    }
  });
}
