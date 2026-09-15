import { app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { ffmpegBinaryName } from '../shared/export-args';

/**
 * Resuelve un binario de FFmpeg: primero el empaquetado en `resources/bin`
 * (sidecar), y si no existe, el del PATH del sistema.
 */
function resolveBinary(name: string): string {
  const candidates = [
    join(process.resourcesPath ?? '', 'bin', name),
    join(app.getAppPath(), 'resources', 'bin', name),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return name;
}

export function resolveFfmpegPath(): string {
  return resolveBinary(ffmpegBinaryName());
}

export function resolveFfprobePath(): string {
  return resolveBinary(ffmpegBinaryName().replace('ffmpeg', 'ffprobe'));
}
