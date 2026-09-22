# Exportación de Contenido para Redes Sociales

Genera un **MP4** con una composición de vídeo + gráficas **elegida y maquetada
por el usuario** (editor de board tipo “zona de gráficas”), para compartir en
redes. Se apoya en **FFmpeg** como sidecar (raw RGBA por stdin).

## Visión general

```
ExportDialog / ExportBoardEditor            Main Process
──────────────────────────────              ────────────
1. board: ítems (widget | vídeo | sección) en rejilla 12 col
2. computeBoardLayout(board) → ExportLayout (rects en px)
3. ExportStage (host oculto) monta los widgets a tamaño de celda
4. por cada frame del rango:
     - seekTo(vídeo, t)
     - viewTimestamp = videoSynchronizer.mapTime(t)
     - bus.update(frame/context) → widgets redibujan (síncrono)
     - compone (vídeo con fit + celdas) en un canvas del tamaño final
     - getImageData → RGBA        ──────►  export:writeFrame(ArrayBuffer)
5. export:finalize → elige destino y guarda
```

## Editor de board (WYSIWYG)

`src/renderer/src/components/dialogs/ExportBoardEditor.tsx`:

- Compone el board **a la resolución real de salida** y lo muestra **escalado por
  CSS** (`transform: scale`), así los **tamaños de texto/línea son los del vídeo
  exportado** (la preview es fiel).
- Encima del canvas hay **cajas por ítem** para:
  - **reordenar** (arrastrar la cabecera),
  - **redimensionar** con las asas (mismos breakpoints que el dashboard:
    `12/9/8/6/4/3`, filas de `MIN/MAX_ROWS`),
  - **quitar** el ítem.
  Al arrastrar solo se mueve el contorno; al soltar se **recompone** (evita el
  coste a resolución alta).
- **Añadir**: `+ Widget…` (de los widgets de la sesión), `+ Sección / Espacio`, y
  el **Vídeo** (con/sin ítem).
- **Presets** que inicializan el board (editables): Overlay, Vertical, Horizontal,
  Solo gráficas.
- Controles: aspecto (`source/16:9/9:16/1:1/4:5/custom`), resolución, colocación
  del vídeo (`flow`/`background`), ajuste (`contain`/`cover`), panel
  (`translucent`/`none`) y supersampling.

## Modelo (puro)

`src/shared/export-composition.ts` + `src/shared/grid.ts`:

```ts
type ExportItem =
  | { id; kind: 'widget';  widgetId: string; width; height }
  | { id; kind: 'video';                     width; height }
  | { id; kind: 'section'; label?;           width; height };  // transparente

interface ExportBoard {
  aspect; resolution; videoPlacement: 'flow' | 'background';
  videoFit: 'contain' | 'cover'; panel: 'translucent' | 'none';
  supersample: 1 | 2; background: string; items: ExportItem[];
}
computeBoardLayout(board, source?, outputSize?) → ExportLayout   // rects en px
```

- Empaqueta los ítems en **filas de 12 columnas** (flujo, igual que el dashboard).
- La **unidad de fila** se auto-ajusta para que el board **siempre llene** el
  lienzo (los altos son relativos).
- **Alinear a izquierda/derecha** sobre el vídeo se hace con `section` (p. ej.
  `[sección 6][widget 6]` alinea a la derecha; `[sección 12 h4]` empuja hacia abajo).
- El vídeo `background` se saca del flujo y se dibuja **a sangre** por detrás.
- Dimensiones siempre **pares** (`yuv420p`).

## Compositor offscreen (`ExportStage`)

`src/renderer/src/lib/export-stage.tsx`:

- Monta los widgets del board en un contenedor oculto a tamaño de celda ×
  `supersample`, con un **`FrameBus` dedicado**; al publicar el frame los widgets
  se repintan **de forma síncrona** (`setWidgetDrawImmediate`), sin depender de `rAF`.
- Captura el **canvas de cada widget** a su rect dentro de la celda. El vídeo se
  dibuja con `contain`/`cover` real (sin deformar); `section` no dibuja nada.
- **Modo directo** (`live`): las gráficas avanzan con el vídeo (ver `docs/08`).

## Orquestador (renderer)

`src/services/video-exporter.ts` → `exportVideo(config, onProgress?, signal?)`:
por frame hace `seekTo`, calcula el timestamp de telemetría con
**`videoSynchronizer.mapTime`** (vídeo → telemetría, respeta anclaje/drift) y
compone. Envía cada frame como raw RGBA y reporta progreso.

## Persistencia

- **Layout** (`DashboardLayout.exportBoard`): se guarda/carga con los layouts
  (`LayoutDialog`). El store expone `exportBoard` + `setExportBoard`.
- **Sesión** (`SessionFile.export`, `SessionWidget.id`): el board y las
  referencias a widgets se guardan en `session.json`. Campos **opcionales**
  (compatibles con sesiones antiguas).

## FFmpeg y argumentos

- Resolución de binarios: `src/main/ffmpeg.ts` (sidecar o PATH).
- Argumentos (puro): `src/shared/export-args.ts` (`buildFfmpegArgs`), entrada
  `rawvideo` (RGBA) → H.264 (`libx264`, `-crf`, `-preset`) o VP9.
- El main (`src/main/export-service.ts`) escribe los frames por `stdin` con
  backpressure y maneja los errores de `stdin` (evita `EPIPE` al cancelar).

## Tests

- Unit: `tests/unit/shared/export-composition.test.ts` (board, presets, vídeo
  background, secciones), `tests/unit/shared/export-args.test.ts`.
- Integración: `tests/integration/export-ffmpeg.test.ts` (MP4 real con ffprobe).
- E2E: `e2e:export` (compone, envía frames y cancela a mitad).
