import { eventBus } from './event-bus';
import { telemetryStore } from './telemetry-store';
import type { TelemetryFrame } from './types/telemetry';
import type { VideoFrameContext } from './types/video';

interface RvfcMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
}

/**
 * Instala un polyfill de `requestVideoFrameCallback` basado en rAF
 * para entornos que no lo soportan.
 */
export function installRvfcPolyfill(): void {
  if (typeof HTMLVideoElement === 'undefined') return;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) return;

  console.warn('requestVideoFrameCallback no soportado, usando polyfill (rAF)');

  (HTMLVideoElement.prototype as unknown as Record<string, unknown>)['requestVideoFrameCallback'] =
    function (this: HTMLVideoElement, callback: (now: number, meta: RvfcMetadata) => void): number {
      let lastTime = -1;
      let rafId = 0;

      const check = (): void => {
        const currentTime = this.currentTime;
        if (currentTime !== lastTime) {
          lastTime = currentTime;
          callback(performance.now(), {
            presentationTime: performance.now(),
            expectedDisplayTime: performance.now(),
            width: this.videoWidth,
            height: this.videoHeight,
            mediaTime: currentTime,
            presentedFrames: Math.round(currentTime * 30),
          });
        }
        rafId = requestAnimationFrame(check);
      };

      rafId = requestAnimationFrame(check);
      rafIdMap.set(this, rafId);
      return rafId;
    };

  const rafIdMap = new WeakMap<HTMLVideoElement, number>();

  (HTMLVideoElement.prototype as unknown as Record<string, unknown>)['cancelVideoFrameCallback'] =
    function (this: HTMLVideoElement, _id: number): void {
      const rafId = rafIdMap.get(this);
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
        rafIdMap.delete(this);
      }
    };
}

/**
 * Opciones del sincronizador.
 * Permite instanciar un segundo sincronizador para la comparación.
 */
export interface VideoSynchronizerOptions {
  /** Evento del EventBus en el que se emite cada frame. */
  frameEvent?: 'sync:frame' | 'comparison:frame';
  /** Dataset de telemetría del que se leen los frames. */
  dataset?: 'primary' | 'comparison';
}

/**
 * Motor de sincronización vídeo-telemetría.
 *
 * Mapea el `mediaTime` (PTS) de cada frame de vídeo a un timestamp de
 * telemetría usando offset de drift + anchor point, y emite el frame
 * más cercano por el EventBus (`sync:frame` o `comparison:frame`).
 */
export class VideoSynchronizer {
  private video: HTMLVideoElement | null = null;
  private callbackId: number | null = null;
  private running = false;

  private driftOffset_ms = 0;
  private anchorPoint: { video_ms: number; telemetry_ms: number } | null = null;
  private declaredFps = 30;
  /** Posición de arranque pendiente (s) hasta que el vídeo esté listo. */
  private pendingSeek_s: number | null = null;

  private readonly frameEvent: 'sync:frame' | 'comparison:frame';
  private readonly datasetSource: 'primary' | 'comparison';

  constructor(options: VideoSynchronizerOptions = {}) {
    this.frameEvent = options.frameEvent ?? 'sync:frame';
    this.datasetSource = options.dataset ?? 'primary';
  }

  private lastMediaTime_ms = 0;
  private totalDriftMs = 0;
  private driftSamples = 0;
  private maxDriftMs = 0;

  /**
   * Adjunta el sincronizador a un elemento `<video>` e inicia el loop.
   */
  attach(video: HTMLVideoElement): void {
    this.installPolyfillIfNeeded();
    this.video = video;
    this.startLoop();
    this.applyPendingSeek();
  }

  /**
   * Detiene el loop y desadjunta el elemento.
   */
  detach(): void {
    this.stopLoop();
    this.video = null;
  }

  /**
   * Posiciona el vídeo en `seconds` en cuanto esté disponible: lo aplica ya si
   * hay metadatos, o espera a `loadedmetadata`. Se usa al cargar una sesión para
   * arrancar la reproducción en el anchor (t=0 relativo).
   */
  seekToStart(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.pendingSeek_s = null;
      return;
    }
    this.pendingSeek_s = seconds;
    this.applyPendingSeek();
  }

  /** Cancela un arranque pendiente. */
  clearPendingSeek(): void {
    this.pendingSeek_s = null;
  }

  private applyPendingSeek(): void {
    const requested = this.pendingSeek_s;
    const video = this.video;
    if (requested == null || !video) return;

    if (video.readyState >= 1) {
      this.pendingSeek_s = null;
      video.currentTime = Math.min(requested, video.duration || requested);
      this.refresh();
      return;
    }

    video.addEventListener(
      'loadedmetadata',
      () => {
        if (this.video !== video || this.pendingSeek_s !== requested) return;
        this.pendingSeek_s = null;
        video.currentTime = Math.min(requested, video.duration || requested);
        this.refresh();
      },
      { once: true }
    );
  }

  setDataset(): void {
    // El dataset vive en el TelemetryStore; se mantiene por compatibilidad de API.
  }

  setDriftOffset(offset_ms: number): void {
    this.driftOffset_ms = offset_ms;
    eventBus.emit('sync:offset-change', { offset_ms });
  }

  setAnchorPoint(video_ms: number, telemetry_ms: number): void {
    this.anchorPoint = { video_ms, telemetry_ms };
    eventBus.emit('sync:anchor-set', {
      videoFrame: Math.round((video_ms / 1000) * this.declaredFps),
      telemetryFrame: Math.round(telemetry_ms),
    });
  }

  clearAnchor(): void {
    this.anchorPoint = null;
    this.pendingSeek_s = null;
  }

  setDeclaredFps(fps: number): void {
    if (fps > 0) this.declaredFps = fps;
  }

  setPlaybackRate(rate: number): void {
    if (!this.video) return;
    const clamped = Math.max(0.1, Math.min(2.0, rate));
    this.video.playbackRate = clamped;
    eventBus.emit('sync:rate-change', { rate: clamped });
  }

  /**
   * Avanza exactamente un frame.
   */
  stepForward(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.currentTime = Math.min(
      this.video.duration || Infinity,
      this.video.currentTime + 1 / this.declaredFps
    );
  }

  /**
   * Retrocede exactamente un frame.
   */
  stepBackward(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.currentTime = Math.max(0, this.video.currentTime - 1 / this.declaredFps);
  }

  /**
   * Salta a un tiempo concreto (segundos).
   */
  seekTo(time_s: number): void {
    if (!this.video) return;
    this.video.currentTime = Math.max(0, time_s);
    eventBus.emit('video:seek', { time_s });
  }

  play(): void {
    this.video?.play().catch(() => undefined);
  }

  pause(): void {
    this.video?.pause();
  }

  /**
   * Mapea el media time del vídeo al timestamp de telemetría objetivo.
   */
  mapTime(mediaTime_ms: number): number {
    const adjusted = mediaTime_ms + this.driftOffset_ms;
    if (this.anchorPoint) {
      return adjusted - this.anchorPoint.video_ms + this.anchorPoint.telemetry_ms;
    }
    return adjusted;
  }

  /**
   * Inverso de `mapTime`: dado un timestamp de telemetría, devuelve el
   * `mediaTime` de vídeo que lo representa (respeta drift y ancla).
   */
  unmapTime(telemetry_ms: number): number {
    if (this.anchorPoint) {
      return (
        telemetry_ms -
        this.driftOffset_ms +
        this.anchorPoint.video_ms -
        this.anchorPoint.telemetry_ms
      );
    }
    return telemetry_ms - this.driftOffset_ms;
  }

  /**
   * Fuerza una evaluación del frame actual (útil en pausa/seek).
   */
  refresh(): void {
    if (!this.video) return;
    const mediaTime_ms = this.video.currentTime * 1000;
    this.processFrame(mediaTime_ms, this.video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0, this.video.videoWidth, this.video.videoHeight);
  }

  get driftOffset(): number {
    return this.driftOffset_ms;
  }

  get currentTime(): number {
    return this.video?.currentTime ?? 0;
  }

  get duration(): number {
    return this.video?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.video ? !this.video.paused : false;
  }

  get fps(): number {
    return this.declaredFps;
  }

  get playbackRate(): number {
    return this.video?.playbackRate ?? 1;
  }

  get anchor(): { video_ms: number; telemetry_ms: number } | null {
    return this.anchorPoint;
  }

  get averageDrift(): number {
    return this.driftSamples > 0 ? this.totalDriftMs / this.driftSamples : 0;
  }

  get maxDrift(): number {
    return this.maxDriftMs;
  }

  resetStats(): void {
    this.totalDriftMs = 0;
    this.driftSamples = 0;
    this.maxDriftMs = 0;
  }

  private startLoop(): void {
    if (!this.video || this.running) return;
    this.running = true;

    const loop = (_now: DOMHighResTimeStamp, metadata: RvfcMetadata): void => {
      if (!this.video || !this.running) return;
      this.processFrame(
        metadata.mediaTime * 1000,
        metadata.presentedFrames,
        metadata.width,
        metadata.height
      );
      this.callbackId = this.video.requestVideoFrameCallback(loop);
    };

    this.callbackId = this.video.requestVideoFrameCallback(loop);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.callbackId !== null && this.video) {
      this.video.cancelVideoFrameCallback(this.callbackId);
    }
    this.callbackId = null;
  }

  private processFrame(
    mediaTime_ms: number,
    presentedFrames: number,
    width: number,
    height: number
  ): void {
    if (!this.video) return;

    this.lastMediaTime_ms = mediaTime_ms;
    const targetTime_ms = this.mapTime(mediaTime_ms);

    const found =
      this.datasetSource === 'comparison'
        ? telemetryStore.findClosestFrameComparison(targetTime_ms)
        : telemetryStore.findClosestFrame(targetTime_ms);

    const frame: TelemetryFrame = found ?? {
      timestamp_ms: targetTime_ms,
      data: {},
    };

    const driftMs = Math.abs(targetTime_ms - frame.timestamp_ms);
    this.totalDriftMs += driftMs;
    this.driftSamples++;
    this.maxDriftMs = Math.max(this.maxDriftMs, driftMs);

    const context: VideoFrameContext = {
      currentTime_s: this.video.currentTime,
      mediaTime_s: mediaTime_ms / 1000,
      presentedFrames,
      duration_s: this.video.duration || 0,
      playbackRate: this.video.playbackRate,
      isPlaying: !this.video.paused,
      videoWidth: width || this.video.videoWidth,
      videoHeight: height || this.video.videoHeight,
      declaredFps: this.declaredFps,
      viewTimestamp_ms: targetTime_ms,
    };

    eventBus.emit(this.frameEvent, { frame, context });
  }

  private installPolyfillIfNeeded(): void {
    installRvfcPolyfill();
  }
}

export const videoSynchronizer = new VideoSynchronizer();
