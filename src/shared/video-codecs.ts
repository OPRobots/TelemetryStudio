/**
 * Códecs de vídeo que Chromium (Electron) puede decodificar de forma nativa.
 * Si un vídeo usa otro códec (p. ej. HEVC/H.265, típico en móviles), hay que
 * transcodecarlo antes de reproducirlo.
 */
export const PLAYABLE_VIDEO_CODECS = ['h264', 'avc1', 'vp8', 'vp9', 'av1', 'theora'];

/**
 * Indica si un códec de vídeo es reproducible en el navegador.
 * Si el códec es desconocido (`null`/vacío) devuelve `true` para dejar
 * que el reproductor lo intente.
 */
export function isPlayableVideoCodec(codec: string | null | undefined): boolean {
  if (!codec) return true;
  const normalized = codec.toLowerCase();
  return PLAYABLE_VIDEO_CODECS.some((playable) => normalized.includes(playable));
}
