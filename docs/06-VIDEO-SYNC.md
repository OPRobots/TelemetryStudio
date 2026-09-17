# Sincronización Vídeo-Telemetría

Sincroniza un vídeo `.mp4` pregrabado con la telemetría por **timestamp**, con
precisión de frame. El motor es `VideoSynchronizer` (`src/core/video-synchronizer.ts`).

## Mecanismo

`requestVideoFrameCallback` (RVFC) entrega, por cada frame presentado, un objeto con
`mediaTime` (PTS en segundos), `presentedFrames` (nº de frames mostrados) y las
dimensiones. Con `mediaTime` se calcula el timestamp de telemetría objetivo:

```typescript
mapTime(mediaTime_ms) =
  anchorPoint
    ? mediaTime_ms + driftOffset_ms - anchorPoint.video_ms + anchorPoint.telemetry_ms
    : mediaTime_ms + driftOffset_ms;
```

Con ese target se busca el `TelemetryFrame` más cercano por **búsqueda binaria**
O(log N) y se emite el evento `sync:frame` (o `comparison:frame`) con
`{ frame, context }`. El `VideoFrameContext` incluye `viewTimestamp_ms`, que es el
timestamp efectivo que consumen los widgets.

### API principal

```typescript
attach(video); detach();
setDriftOffset(offset_ms);          // ajuste manual de desfase
setAnchorPoint(video_ms, telemetry_ms); clearAnchor();
setDeclaredFps(fps);                // fps real (de ffprobe)
setPlaybackRate(rate);              // 0.1x–2x
play(); pause(); seekTo(time_s);
stepForward(); stepBackward();      // avanza/retrocede 1 frame (1 / declaredFps)
refresh();                          // reevalúa el frame actual (pausa/seek)
mapTime(mediaTime_ms);

// getters: driftOffset, currentTime, duration, isPlaying, fps, playbackRate,
//          anchor, averageDrift, maxDrift
// resetStats()
```

### Instancias

- `videoSynchronizer` — panel principal; emite `sync:frame` (dataset primario).
- `comparisonSynchronizer` (`src/renderer/src/lib/comparison-sync.ts`) — panel de
  comparación; emite `comparison:frame` (dataset de comparación).

## FPS real

El fps del vídeo se obtiene con **ffprobe** (`src/main/video-service.ts`) y se fija con
`setDeclaredFps(fps)`; así el paso de 1 frame avanza exactamente `1 / fps`. Si no
estuviera disponible, `VideoPlayer` lo estima con RVFC midiendo el delta de
`mediaTime` entre frames consecutivos durante la reproducción.

## Anchor point y calibración

- **«Alinear aquí»** (`src/renderer/src/lib/sync-actions.ts`): fija el frame actual
  del vídeo como `t=0` de la telemetría → `anchorPoint = { video_ms, telemetry_ms: 0 }`.
- **Reset**: `clearAnchor()`.
- También hay un ajuste manual de desfase (`setDriftOffset`).

## `averageDrift` / `maxDrift`

Miden `|target − timestamp del frame más cercano|` (media y máximo). Reflejan la
**densidad de muestreo** de la telemetría más que un error de sincronización (un
offset constante no lo altera). Se usan como métrica interna; no se muestran en la UI.

## Polyfill

Si el navegador no expone `requestVideoFrameCallback`, se instala un polyfill
(`installRvfcPolyfill`) que lo emula sobre `requestAnimationFrame`; solo se usa cuando
RVFC no está disponible nativamente.

## Modo sin vídeo

Sin vídeo cargado, `VideoSynchronizer` no tiene elemento adjunto y los widgets usan el
último frame (o el hover) como timestamp. Ver `docs/08-WIDGET-SYSTEM.md`.
