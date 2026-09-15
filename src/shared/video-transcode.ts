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
