import { useAppStore } from '../stores/app-store';

export interface PreparedVideo {
  path: string;
  fps: number | null;
}

/**
 * Prepara un vídeo para su reproducción: si su códec no está soportado por
 * Chromium (p. ej. HEVC/H.265) lo transcodea a H.264 con FFmpeg. Devuelve la
 * ruta reproducible y los fps reales (de ffprobe), o `null` si se canceló o falló.
 */
export async function prepareVideoFile(path: string): Promise<PreparedVideo | null> {
  const api = window.api;
  if (!api?.videoPrepare) return { path, fps: null };

  const store = () => useAppStore.getState();
  store().setStatusMessage('Preparando vídeo…');

  try {
    const res = await api.videoPrepare(path);
    if (!res.success) {
      store().setError(res.error ?? 'No se pudo preparar el vídeo');
      store().setStatusMessage('');
      return null;
    }
    if (res.cancelled) {
      store().setStatusMessage('Conversión cancelada');
      return null;
    }
    store().setStatusMessage(res.transcoded ? 'Vídeo convertido a H.264' : '');
    return { path: res.path || path, fps: res.fps ?? null };
  } catch (err) {
    store().setError((err as Error).message);
    store().setStatusMessage('');
    return null;
  } finally {
    store().setVideoPrepare(false);
  }
}
