import type { ExportConfig } from '@core/types/video';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { createExportStage } from '@renderer/lib/export-stage';
import { seekVideo } from '@renderer/lib/video-seek';

export interface ExportProgress {
  percent: number;
  currentFrame: number;
  totalFrames: number;
  /** Tiempo restante estimado en ms (`null` mientras no hay muestra fiable). */
  etaMs: number | null;
}

/**
 * Exporta un vídeo componiendo el layout (vídeo + celdas de widgets) en un host
 * offscreen a resolución final y enviando los frames raw RGBA a FFmpeg (Main).
 *
 * El timestamp de telemetría de cada frame se obtiene mapeando el tiempo del
 * vídeo con `videoSynchronizer.mapTime`, de modo que las gráficas muestran el
 * frame sincronizado correcto (no el estado "en vivo" del panel).
 */
export async function exportVideo(
  config: ExportConfig,
  onProgress?: (progress: ExportProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const api = window.api;
  if (!api) throw new Error('API no disponible');

  const { layout } = config;
  const video = document.querySelector<HTMLVideoElement>('video');
  const wasPlaying = video ? !video.paused : false;
  const originalTime = video?.currentTime ?? 0;
  video?.pause();

  const restoreVideo = (): void => {
    if (!video) return;
    video.currentTime = originalTime;
    if (wasPlaying) video.play().catch(() => undefined);
  };

  const stage = await createExportStage({
    layout,
    widgets: config.widgets,
    getFrames: () => telemetryStore.getAllFrames(),
    videoSize: video ? { width: video.videoWidth, height: video.videoHeight } : null,
    live: config.live,
    liveWindowMs: config.liveWindowMs,
  });
  const overlay = config.includeOverlays ? { label: config.sessionLabel } : undefined;

  const total = Math.max(config.endFrame - config.startFrame + 1, 1);
  // Se descarta el primer frame del promedio (incluye warm-up de seek/decode).
  let baselineAt: number | null = null;

  const start = await api.exportStart({
    width: layout.width,
    height: layout.height,
    fps: config.fps,
    format: config.format,
    codec: config.codec,
    crf: config.crf,
    preset: config.preset,
    outputPath: config.outputPath,
  });
  if (!start.success) {
    stage.dispose();
    throw new Error(start.error ?? 'No se pudo iniciar FFmpeg');
  }

  try {
    for (let i = config.startFrame; i <= config.endFrame; i++) {
      if (signal?.aborted) throw new DOMException('Exportación cancelada', 'AbortError');

      const mediaTime_s = i / config.fps;
      if (video) await seekVideo(video, Math.min(mediaTime_s, video.duration || mediaTime_s));

      const mediaTime_ms = video ? video.currentTime * 1000 : mediaTime_s * 1000;
      const viewTimestamp_ms = videoSynchronizer.mapTime(mediaTime_ms);

      await stage.renderFrame(video, viewTimestamp_ms, overlay);

      const pixels = stage.getImageData();
      const written = await api.exportWriteFrame(pixels.buffer as ArrayBuffer);
      if (!written.success) throw new Error(written.error ?? 'Error al escribir el frame');

      const currentFrame = i - config.startFrame + 1;
      const now = performance.now();
      let etaMs: number | null = null;
      if (currentFrame === 1) {
        baselineAt = now;
      } else if (baselineAt !== null) {
        const avgMsPerFrame = (now - baselineAt) / (currentFrame - 1);
        etaMs = Math.round(avgMsPerFrame * (total - currentFrame));
      }
      onProgress?.({
        percent: Math.round((currentFrame / total) * 100),
        currentFrame,
        totalFrames: total,
        etaMs,
      });
    }
  } catch (error) {
    await api.exportAbort().catch(() => undefined);
    throw error;
  } finally {
    stage.dispose();
    restoreVideo();
  }

  const finalize = await api.exportFinalize();
  if (!finalize.success) throw new Error(finalize.error ?? 'FFmpeg falló al finalizar');

  return finalize.outputPath ?? '';
}
