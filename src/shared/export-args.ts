/**
 * Construcción de argumentos de FFmpeg para la exportación de vídeo.
 * Módulo puro (sin dependencias) para poder testearse de forma aislada.
 */

export type ExportFormat = 'mp4' | 'webm';
export type ExportCodec = 'h264' | 'vp9';

export interface FfmpegArgsInput {
  width: number;
  height: number;
  fps: number;
  format: ExportFormat;
  codec: ExportCodec;
  outputPath: string;
  /** Calidad CRF (menor = mejor). Por defecto 18 para H.264, 30 para VP9. */
  crf?: number;
  /** Preset de libx264 (ultrafast…veryslow). Por defecto `medium`. */
  preset?: string;
}

/**
 * Devuelve los argumentos para FFmpeg, que recibe frames raw RGBA por stdin.
 */
export function buildFfmpegArgs(input: FfmpegArgsInput): string[] {
  const { width, height, fps, format, outputPath } = input;

  const base = [
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${width}x${height}`,
    '-r',
    String(fps),
    '-i',
    'pipe:0',
  ];

  if (format === 'webm' || input.codec === 'vp9') {
    const crf = input.crf ?? 30;
    return [
      ...base,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      String(crf),
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ];
  }

  const crf = input.crf ?? 18;
  return [
    ...base,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    String(crf),
    '-preset',
    input.preset ?? 'medium',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

/**
 * Nombre de fichero del binario de FFmpeg empaquetado, según la plataforma.
 */
export function ffmpegBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}
