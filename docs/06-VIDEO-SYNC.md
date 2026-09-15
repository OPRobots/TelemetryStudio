# Sincronización Vídeo-Telemetría

> **Estado de implementación**: implementado en `src/core/video-synchronizer.ts`.
> El sincronizador emite cada frame por el EventBus como `sync:frame` con payload
> `{ frame, context }`, en lugar de un callback directo. Los widgets se suscriben a
> ese evento. El timestamp de telemetría proviene del primer campo de cada línea
> Serial (ver `docs/05-PLUGIN-SYSTEM.md`). El mapeo es:
> `telemetry_ms = mediaTime_ms + offset_ms − anchor.video_ms + anchor.telemetry_ms`.

## El Problema del Drift

La cámara MP4 y el microcontrolador del robot **no comparten reloj**. El vídeo se graba a ~30fps con su propio timestamp, mientras que la telemetría se registra con el reloj del STM32. Existe un desfase inicial ($\Delta t$) que varía en cada grabación.

```
Línea de tiempo del Vídeo:    |-----t=0-----|--------- frame 30 --------|--------- frame 60 --------|
Línea de tiempo Telemetría:   |--t=0--|---- 100ms ----|---- 200ms ----|---- 300ms ----|
                               ^^^^^^^^
                               Offset desconocido
```

## Mecanismo de Sincronización

### requestVideoFrameCallback

La API `requestVideoFrameCallback` dispara un callback **una vez por frame decodificado** del vídeo, con metadata que incluye el `mediaTime` (PTS - Presentation Timestamp). Este es el valor que usamos para sincronizar, NO `video.currentTime` (que es menos preciso).

```typescript
// src/core/video-synchronizer.ts

interface RvfcMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;       // PTS en segundos — USAR ESTE PARA SYNC
  presentedFrames: number;
  processingDuration?: number;
}

class VideoSynchronizer {
  private video: HTMLVideoElement | null = null;
  private callbackId: number | null = null;
  private dataset: TelemetryDataset | null = null;
  private driftOffset_ms: number = 0;
  private anchorPoint: { video_ms: number; telemetry_ms: number } | null = null;
  private onFrameCallback: ((frame: TelemetryFrame, context: VideoFrameContext) => void) | null = null;

  /**
   * Inicializa el sincronizador con un elemento de vídeo HTML.
   */
  attach(video: HTMLVideoElement): void {
    this.video = video;
    this.startLoop();
  }

  /**
   * Desconecta el sincronizador.
   */
  detach(): void {
    if (this.callbackId !== null && this.video) {
      this.video.cancelVideoFrameCallback(this.callbackId);
    }
    this.callbackId = null;
    this.video = null;
  }

  /**
   * Establece el dataset de telemetría para sincronizar.
   */
  setDataset(dataset: TelemetryDataset): void {
    this.dataset = dataset;
  }

  /**
   * Ajusta el offset manual de drift en milisegundos.
   */
  setDriftOffset(offset_ms: number): void {
    this.driftOffset_ms = offset_ms;
  }

  /**
   * Establece un anchor point: el frame de vídeo que corresponde
   * al t=0 de la telemetría.
   */
  setAnchorPoint(videoFrame_ms: number, telemetryFrame_ms: number): void {
    this.anchorPoint = { video_ms: videoFrame_ms, telemetry_ms: telemetryFrame_ms };
  }

  /**
   * Loop principal de sincronización usando requestVideoFrameCallback.
   */
  private startLoop(): void {
    if (!this.video) return;

    const loop = (_now: DOMHighResTimeStamp, metadata: RvfcMetadata) => {
      // El mediaTime (PTS) es el valor más preciso para sincronización
      const mediaTime_ms = metadata.mediaTime * 1000;

      // Aplicar drift offset
      const adjustedTime_ms = mediaTime_ms + this.driftOffset_ms;

      // Aplicar anchor point si existe
      let targetTime_ms = adjustedTime_ms;
      if (this.anchorPoint) {
        targetTime_ms = adjustedTime_ms - this.anchorPoint.video_ms + this.anchorPoint.telemetry_frame_ms;
      }

      // Buscar el frame de telemetría más cercano
      const frame = this.findClosestFrame(targetTime_ms);

      // Construir contexto de vídeo
      const context: VideoFrameContext = {
        currentTime_s: this.video!.currentTime,
        mediaTime_s: metadata.mediaTime,
        presentedFrames: metadata.presentedFrames,
        duration_s: this.video!.duration,
        playbackRate: this.video!.playbackRate,
        isPlaying: !this.video!.paused,
        videoWidth: metadata.width,
        videoHeight: metadata.height,
        declaredFps: 0, // Se calcula al cargar el vídeo
        viewTimestamp_ms: targetTime_ms,
      };

      // Notificar al sistema
      this.onFrameCallback?.(frame, context);

      // Re-registrar para el siguiente frame
      this.callbackId = this.video!.requestVideoFrameCallback(loop);
    };

    this.callbackId = this.video.requestVideoFrameCallback(loop);
  }

  /**
   * Búsqueda binaria O(log N) para encontrar el frame más cercano al timestamp dado.
   */
  private findClosestFrame(target_ms: number): TelemetryFrame {
    if (!this.dataset || this.dataset.frames.length === 0) {
      return { timestamp_ms: 0, data: {} };
    }

    const frames = this.dataset.frames;
    let low = 0;
    let high = frames.length - 1;

    // Búsqueda binaria
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const midTime = frames[mid].timestamp_ms;

      if (midTime < target_ms) {
        low = mid + 1;
      } else if (midTime > target_ms) {
        high = mid - 1;
      } else {
        return frames[mid]; // Match exacto
      }
    }

    // `low` es el índice del primer frame con timestamp >= target
    // Comparamos con `high` (el anterior) para ver cuál está más cerca
    if (low >= frames.length) return frames[frames.length - 1];
    if (high < 0) return frames[0];

    const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
    const diffHigh = Math.abs(frames[high].timestamp_ms - target_ms);

    return diffLow <= diffHigh ? frames[low] : frames[high];
  }

  /**
   * Busca un frame exacto por índice.
   */
  getFrameAtIndex(index: number): TelemetryFrame | null {
    if (!this.dataset) return null;
    return this.dataset.frames[index] ?? null;
  }

  /**
   * Obtiene el índice del frame más cercano a un timestamp.
   */
  getFrameIndexAtTime(target_ms: number): number {
    if (!this.dataset || this.dataset.frames.length === 0) return 0;

    const frames = this.dataset.frames;
    let low = 0;
    let high = frames.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timestamp_ms < target_ms) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (low >= frames.length) return frames.length - 1;
    if (low === 0) return 0;

    const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
    const diffHigh = Math.abs(frames[low - 1].timestamp_ms - target_ms);

    return diffLow <= diffHigh ? low : low - 1;
  }

  /**
   * Registra el callback que se llama en cada frame sincronizado.
   */
  onFrame(callback: (frame: TelemetryFrame, context: VideoFrameContext) => void): void {
    this.onFrameCallback = callback;
  }

  /**
   * Avanza exactamente 1 frame hacia delante.
   */
  stepForward(): void {
    if (!this.video) return;
    const fps = 30; // TODO: detectar del vídeo
    this.video.currentTime += 1 / fps;
  }

  /**
   * Retrocede exactamente 1 frame.
   */
  stepBackward(): void {
    if (!this.video) return;
    const fps = 30;
    this.video.currentTime = Math.max(0, this.video.currentTime - 1 / fps);
  }

  /**
   * Establece la velocidad de reproducción.
   */
  setPlaybackRate(rate: number): void {
    if (this.video) {
      this.video.playbackRate = Math.max(0.1, Math.min(2.0, rate));
    }
  }
}

export const videoSynchronizer = new VideoSynchronizer();
```

## Calibración de Drift

### Métodos disponibles

1. **Offset Manual**: El usuario ajusta un slider +/- ms hasta que las gráficas coincidan con el vídeo
2. **Anchor Point**: El usuario hace clic en un frame específico del vídeo (ej: pitido de salida, encendido de LED) y marca ese instante como t=0 del log
3. **Autocalibración futura**: Detectar eventos synchronizables (sonido de buzzer en audio + spike en telemetría)

### Flujo de Anchor Point

```
1. Usuario pausa el vídeo en el frame deseado
2. Usuario hace clic en "Set Anchor Point" en la UI
3. La app captura:
   - videoFrameIndex = video.currentTime * fps
   - telemetryFrameIndex = búsqueda del timestamp más cercano en el dataset
4. Se establece la relación:
   anchorPoint = {
     video_ms: videoFrameIndex * (1000 / fps),
     telemetry_ms: dataset.frames[telemetryFrameIndex].timestamp_ms
   }
5. A partir de ese momento, toda sincronización usa:
   targetTime = (mediaTime_ms + driftOffset) - anchorPoint.video_ms + anchorPoint.telemetry_ms
```

## Polyfill para Navegadores Sin Soporte

```typescript
// src/core/video-synchronizer.ts (al inicio del archivo)

if (typeof HTMLVideoElement !== 'undefined' &&
    !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
  console.warn('requestVideoFrameCallback not supported, using polyfill');

  (HTMLVideoElement.prototype as any).requestVideoFrameCallback =
    function(callback: Function) {
      let lastTime = -1;
      let id = 0;

      const check = () => {
        const currentTime = this.currentTime;
        if (currentTime !== lastTime) {
          lastTime = currentTime;
          const metadata = {
            presentationTime: performance.now(),
            expectedDisplayTime: performance.now(),
            width: this.videoWidth,
            height: this.videoHeight,
            mediaTime: currentTime,
            presentedFrames: this.getVideoPlaybackQuality().totalVideoFrames,
          };
          callback(performance.now(), metadata);
        }
        (this as any).__rvfcId = requestAnimationFrame(check);
      };

      (this as any).__rvfcId = requestAnimationFrame(check);
      return id;
    };

  (HTMLVideoElement.prototype as any).cancelVideoFrameCallback = function(id: number) {
    cancelAnimationFrame((this as any).__rvfcId);
  };
}
```
