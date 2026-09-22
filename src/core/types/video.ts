import type { CompositionWidget, ExportLayout } from '@shared/export-composition';

/**
 * Contexto completo del frame de vídeo actual.
 * Se actualiza en cada `requestVideoFrameCallback`.
 */
export interface VideoFrameContext {
  currentTime_s: number;
  mediaTime_s: number;
  presentedFrames: number;
  duration_s: number;
  playbackRate: number;
  isPlaying: boolean;
  videoWidth: number;
  videoHeight: number;
  declaredFps: number;
  viewTimestamp_ms: number;
}

/**
 * Estado de reproducción persistente.
 */
export interface PlaybackState {
  driftOffset_ms: number;
  anchorPoint_videoFrame: number | null;
  anchorPoint_telemetryFrame: number | null;
  playbackRate: number;
  loopEnabled: boolean;
}

/**
 * Configuración para la exportación de vídeo.
 *
 * La composición (board de ítems, resolución y placement del vídeo) vive en
 * `layout` (`@shared/export-composition`); los widgets se renderizan a tamaño de
 * celda en un host oculto y se captura su canvas. La ruta de salida la resuelve
 * el main process.
 */
export interface ExportConfig {
  format: 'mp4' | 'webm';
  codec: 'h264' | 'vp9';
  fps: number;
  /** Calidad CRF (menor = mejor). */
  crf?: number;
  /** Preset de libx264. */
  preset?: string;
  startFrame: number;
  endFrame: number;
  /** Layout de composición calculado (incluye ancho/alto finales). */
  layout: ExportLayout;
  /** Widgets disponibles para renderizar (se usan los referenciados por el layout). */
  widgets: CompositionWidget[];
  includeOverlays: boolean;
  sessionLabel?: string;
  /** Modo directo (replay): las gráficas avanzan con el vídeo. */
  live?: boolean;
  /** Ventana visible (ms) del modo directo. */
  liveWindowMs?: number;
}
