# Exportación de Contenido para Redes Sociales

Genera un **MP4** con el vídeo base y los widgets de telemetría superpuestos, para
compartir en redes. Se apoya en **FFmpeg** como sidecar (raw RGBA por stdin).

## Visión General

```
Renderer (canvas)                          Main Process
─────────────────                          ────────────
1. exportVideo(config)                     2. export:start → lanza FFmpeg (rawvideo por stdin)
   por cada frame del rango:
     - seekTo(vídeo, t)
     - dibuja vídeo + widgets + overlay
     - getImageData → RGBA        ──────►  export:writeFrame(ArrayBuffer)
     - progreso local                       (escribe en stdin con backpressure)
3. export:finalize → flush      ──────►   export:save → elige destino y guarda
```

- El **renderer** conoce el progreso (recorre los frames) y lo muestra en `ExportDialog`.
- El **Main** ejecuta FFmpeg (sidecar empaquetado en `resources/bin` o del PATH) y
  escribe los frames en su `stdin`.
- Al terminar, se restaura el estado del reproductor (tiempo y play/pausa previos).

## Orquestador (renderer)

`src/services/video-exporter.ts`

```typescript
exportVideo(config: ExportConfig, onProgress?): Promise<string>
```

- Crea un canvas de `config.width × config.height` (`willReadFrequently`).
- Para cada frame `startFrame..endFrame`: `seekTo`, dibuja vídeo base (si
  `includeBaseVideo`), widgets (`includedWidgets`) y overlay (`includeOverlays`, con
  `sessionLabel`), y obtiene los píxeles RGBA.
- Envía cada frame con `exportWriteFrame(image.data.buffer)`.
- Reporta `{ percent, currentFrame, totalFrames }` y devuelve la ruta del MP4.

## API expuesta (`window.api`)

```typescript
exportStart(config): Promise<{ success; error? }>
exportWriteFrame(buffer: ArrayBuffer): Promise<{ success; error? }>
exportFinalize(): Promise<{ success; outputPath?; error? }>
exportAbort(): Promise<{ success }>
exportSave(): Promise<{ canceled; savedPath?; error? }>
```

Canales IPC: `export:start`, `export:writeFrame`, `export:finalize`, `export:abort`, `export:save`.

## FFmpeg y argumentos

- Resolución de binarios: `src/main/ffmpeg.ts` (sidecar o PATH).
- Construcción de argumentos (pura): `src/shared/export-args.ts` (`buildFfmpegArgs`).
- Entrada `rawvideo` (RGBA) → salida H.264 (`libx264`) en MP4.

## UI

`src/renderer/src/components/dialogs/ExportDialog.tsx`: resolución, fps, rango de
frames, widgets a incluir, etiqueta de sesión, barra de progreso y guardado.

## Tests

- Unit: `tests/unit/shared/export-args.test.ts` (argumentos).
- Integración: `tests/integration/export-ffmpeg.test.ts` (MP4 real validado con ffprobe).
- E2E: `e2e:export` (composición del renderer + envío de frames).
