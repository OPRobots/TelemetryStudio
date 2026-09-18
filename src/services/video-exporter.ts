import type { ExportConfig } from '@core/types/video';

export interface ExportProgress {
  percent: number;
  currentFrame: number;
  totalFrames: number;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    try {
      video.currentTime = time;
    } catch {
      done();
      return;
    }
    // Fallback si no dispara `seeked` (p. ej. mismo tiempo)
    window.setTimeout(done, 500);
  });
}

function drawWidgets(
  ctx: CanvasRenderingContext2D,
  config: ExportConfig
): void {
  const ids = config.includedWidgets;
  if (ids.length === 0) return;

  const stripHeight = Math.round(config.height * 0.32);
  const eachWidth = Math.floor(config.width / ids.length);
  const y = config.height - stripHeight;

  ids.forEach((id, index) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-widget-id="${id}"] canvas`);
    if (canvas && canvas.width > 0) {
      ctx.drawImage(canvas, index * eachWidth, y, eachWidth, stripHeight);
    }
  });
}

function drawOverlay(ctx: CanvasRenderingContext2D, config: ExportConfig): void {
  ctx.fillStyle = 'rgba(10, 14, 23, 0.6)';
  ctx.fillRect(0, 0, config.width, 36);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '20px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.sessionLabel ?? 'Telemetry Studio', 16, 18);
}

/**
 * Exporta un vídeo componiendo el vídeo base + overlays de widgets en un
 * canvas y enviando los frames raw RGBA a FFmpeg (Main Process).
 */
export async function exportVideo(
  config: ExportConfig,
  onProgress?: (progress: ExportProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const api = window.api;
  if (!api) throw new Error('API no disponible');

  const video = document.querySelector<HTMLVideoElement>('video');
  const wasPlaying = video ? !video.paused : false;
  const originalTime = video?.currentTime ?? 0;
  video?.pause();

  const restoreVideo = (): void => {
    if (!video) return;
    video.currentTime = originalTime;
    if (wasPlaying) video.play().catch(() => undefined);
  };

  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo crear el canvas de exportación');

  const total = Math.max(config.endFrame - config.startFrame + 1, 1);

  const start = await api.exportStart({
    width: config.width,
    height: config.height,
    fps: config.fps,
    format: config.format,
    codec: config.codec,
  });
  if (!start.success) throw new Error(start.error ?? 'No se pudo iniciar FFmpeg');

  try {
    for (let i = config.startFrame; i <= config.endFrame; i++) {
      if (signal?.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
      const t = i / config.fps;
      if (video) await seekTo(video, Math.min(t, video.duration || t));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, config.width, config.height);

      if (config.includeBaseVideo && video) {
        ctx.drawImage(video, 0, 0, config.width, config.height);
      }
      if (config.includedWidgets.length > 0) {
        drawWidgets(ctx, config);
      }
      if (config.includeOverlays) {
        drawOverlay(ctx, config);
      }

      const image = ctx.getImageData(0, 0, config.width, config.height);
      const written = await api.exportWriteFrame(image.data.buffer as ArrayBuffer);
      if (!written.success) throw new Error(written.error ?? 'Error al escribir el frame');

      const currentFrame = i - config.startFrame + 1;
      onProgress?.({
        percent: Math.round((currentFrame / total) * 100),
        currentFrame,
        totalFrames: total,
      });
    }
  } catch (error) {
    await api.exportAbort().catch(() => undefined);
    throw error;
  } finally {
    restoreVideo();
  }

  const finalize = await api.exportFinalize();
  if (!finalize.success) throw new Error(finalize.error ?? 'FFmpeg falló al finalizar');

  return finalize.outputPath ?? '';
}
