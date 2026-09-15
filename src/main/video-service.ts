import { app, ipcMain, type WebContents } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { mkdir, rm } from 'fs/promises';
import { basename, extname, join } from 'path';
import { isPlayableVideoCodec } from '../shared/video-codecs';
import { buildTranscodeArgs, fpsFromRatio, parseFfmpegProgress, transcodePercent } from '../shared/video-transcode';
import { resolveFfmpegPath, resolveFfprobePath } from './ffmpeg';

let activeChild: ChildProcess | null = null;
let cancelled = false;

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

/** Devuelve el códec y los fps de vídeo de un archivo. */
export async function probeVideoInfo(path: string): Promise<{ codec: string | null; fps: number }> {
  try {
    const result = await run(resolveFfprobePath(), [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,r_frame_rate,avg_frame_rate',
      '-of',
      'csv=p=0',
      path,
    ]);
    if (result.code !== 0) return { codec: null, fps: 0 };
    const [codec, rFrameRate, avgFrameRate] = result.stdout.trim().split('\n')[0]?.split(',') ?? [];
    const fps = fpsFromRatio(rFrameRate) || fpsFromRatio(avgFrameRate);
    return { codec: codec?.trim() || null, fps };
  } catch {
    return { codec: null, fps: 0 };
  }
}

/** Duración del vídeo en segundos (0 si no se puede leer). */
export async function probeVideoDuration(path: string): Promise<number> {
  try {
    const result = await run(resolveFfprobePath(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      path,
    ]);
    if (result.code !== 0) return 0;
    return Number(result.stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function runTranscode(
  args: string[],
  durationSec: number,
  onProgress: (percent: number) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;

    let buffered = '';
    child.stdout.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const outTimeUs = parseFfmpegProgress(line);
        if (outTimeUs !== null) onProgress(transcodePercent(outTimeUs, durationSec));
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      activeChild = null;
      resolve(code ?? -1);
    });
  });
}

/**
 * Comprueba si un vídeo es reproducible en Chromium. Si no (p. ej. HEVC/H.265),
 * lo transcodea a H.264 con FFmpeg y reporta progreso por `video:prepare-status`.
 */
export async function prepareVideo(
  path: string,
  sender?: WebContents
): Promise<{ path: string; transcoded: boolean; fps: number; cancelled?: boolean }> {
  const info = await probeVideoInfo(path);
  if (isPlayableVideoCodec(info.codec)) {
    return { path, transcoded: false, fps: info.fps };
  }

  const dir = join(app.getPath('temp'), 'oprobots-video');
  await mkdir(dir, { recursive: true });
  const output = join(dir, `${basename(path, extname(path))}.h264.mp4`);

  const duration = await probeVideoDuration(path);
  cancelled = false;
  sender?.send('video:prepare-status', { state: 'start', filename: basename(path) });
  sender?.send('video:prepare-status', { state: 'progress', percent: 0 });

  const args = [
    '-progress',
    'pipe:1',
    '-nostats',
    ...buildTranscodeArgs({ inputPath: path, outputPath: output }),
  ];

  const code = await runTranscode(args, duration, (percent) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('video:prepare-status', { state: 'progress', percent });
    }
  });

  if (cancelled) {
    await rm(output, { force: true }).catch(() => undefined);
    return { path, transcoded: false, fps: info.fps, cancelled: true };
  }
  if (code !== 0) {
    throw new Error(`FFmpeg no pudo convertir el vídeo (código ${code})`);
  }
  return { path: output, transcoded: true, fps: info.fps };
}

export function registerVideoHandlers(): void {
  ipcMain.handle('video:prepare', async (event, path: string) => {
    const sender = event.sender;
    try {
      const prepared = await prepareVideo(path, sender);
      return { success: true, ...prepared };
    } catch (err) {
      return { success: false, path, transcoded: false, error: (err as Error).message };
    } finally {
      if (!sender.isDestroyed()) {
        sender.send('video:prepare-status', { state: 'end' });
      }
    }
  });

  ipcMain.handle('video:cancel-prepare', () => {
    cancelled = true;
    if (activeChild) {
      activeChild.kill('SIGKILL');
      activeChild = null;
    }
    return { success: true };
  });
}
