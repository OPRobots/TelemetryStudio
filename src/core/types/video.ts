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
 */
export interface ExportConfig {
  outputPath: string;
  format: 'mp4' | 'webm';
  codec: 'h264' | 'vp9';
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  keyframeInterval_s: number;
  startFrame: number;
  endFrame: number;
  includedWidgets: string[];
  includeBaseVideo: boolean;
  includeOverlays: boolean;
  sessionLabel?: string;
}
