export interface TranscodeArgsInput {
  inputPath: string;
  outputPath: string;
  /** Calidad (menor = mejor). Por defecto 20. */
  crf?: number;
  /** Preset de x264. Por defecto 'veryfast'. */
  preset?: string;
}

/**
 * Argumentos de FFmpeg para convertir un vídeo a H.264 reproducible en Chromium.
 * Aplica autorrotación (FFmpeg lo hace por defecto al re-codificar).
 */
export function buildTranscodeArgs({
  inputPath,
  outputPath,
  crf = 20,
  preset = 'veryfast',
}: TranscodeArgsInput): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

/**
 * Porcentaje (0-99) de progreso de una conversión a partir del tiempo de salida
 * reportado por FFmpeg (`out_time_us`, microsegundos) y la duración total (s).
 */
export function transcodePercent(outTimeUs: number, durationSec: number): number {
  if (!durationSec || durationSec <= 0 || !Number.isFinite(outTimeUs)) return 0;
  return Math.min(99, Math.max(0, Math.round((outTimeUs / 1_000_000 / durationSec) * 100)));
}

/**
 * Extrae el tiempo de salida (`out_time_us`) de una línea de `-progress`.
 * Devuelve `null` si la línea no lo contiene.
 */
export function parseFfmpegProgress(line: string): number | null {
  const match = /out_time_us=(\d+)/.exec(line);
  return match ? Number(match[1]) : null;
}
