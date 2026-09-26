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
- **Añadir**: un único desplegable con `Sección / Espacio` + los widgets de la
  sesión.
- Las cajas muestran el **título del widget** (`label · tipo`) del layout principal.
- **Un único layout, sin presets**: se configuran **Aspect ratio**
  (`16:9/9:16/1:1/4:5`; por defecto **16:9**), **Vídeo** (`Oculto · Primer
  plano · Segundo plano`) y **Panel** (`Translúcido · Sin panel`). La **etiqueta de
  sesión**, el aspecto, el vídeo y el desplegable de añadir van en **una sola
  fila** (el panel se añade al final solo con `Segundo plano`).
  - **Vídeo**: `Primer plano` = ítem del layout; `Segundo plano` = a sangre detrás
    de los widgets; `Oculto` = no se dibuja. Forzado a `Oculto` si no hay vídeo.
  - **Panel** solo se muestra con el vídeo en `Segundo plano`; en el resto es
    siempre translúcido. Aplica a **todos** los widgets (los widgets de canvas no
    pintan su fondo en exportación, vía `transparentBackground`); el espacio/sección
    es siempre transparente.
- **Reempaquetar al cambiar el aspecto**: se reaplican las anchuras por regla
  (**16:9 → media anchura `w6`**; resto → **ancho completo `w12`**) y se recoloca
  todo (se conservan orden, secciones y alturas).
- **Rejilla *staggered* (skyline/bottom-left)**: cada ítem se coloca en la posición
  más alta posible sin solape, **rellenando huecos** (p. ej. un `w6 h2` se apila
  debajo de otro `w6 h2` dentro de la fila de un `w6 h4`).
- **Etiqueta y copyright en franjas propias**: la etiqueta de sesión ocupa una
  **franja superior** (opaca, activable con `board.showLabel`) y el copyright una
  **franja inferior** (siempre) con sus logos: `TelemetryStudio · robotaleh.dev ·
  OPRobots.org`. El board se dispone **entre ambas**, así que **no tapan widgets**
  (antes la etiqueta era un overlay que podía solapar la leyenda del minimapa).
- **Vídeo**: siempre conserva su aspecto; en flujo tiene **ancho libre** y su alto se
  deriva del aspecto (la unidad de fila se resuelve por iteración).
- **Preview viva**: un board "borrador" durante el arrastre reajusta el resto de
  ítems en vivo (transiciones CSS) para ver las proporciones; el canvas se
  recompone al soltar y con *debounce* mientras se arrastra.
- **Leyendas y trazos**: leyenda de la gráfica y readout del minimapa dibujados con
  tamaño propio (se leen en vídeo) y valores por frame; grosor de líneas ajustable
  (`lineScale`, solo exportación).
  - Los anchos de los valores se **precalculan del dataset completo** (valor más
    ancho) y se reservan, así las etiquetas **no se mueven** durante el vídeo.
  - La leyenda de la gráfica **envuelve en varias filas**; el compositor **oculta el
    chrome HTML** del widget y reserva su propia franja (la gráfica cede ese alto).
- **Rango por defecto**: desde **2 s antes** del inicio de los datos de telemetría
  hasta **2 s después** del fin, mapeados a tiempo de vídeo con
  `telemetryToVideoRangeMs()` (`src/renderer/src/lib/telemetry-range.ts`, inversa de
  `mapTime` con anchor/drift). Se puede recortar o prolongar con el slider start–end.
  Exportar requiere telemetría cargada (aunque no haya vídeo).

## Modelo (puro)

`src/shared/export-composition.ts` + `src/shared/grid.ts`:

```ts
type ExportItem =
  | { id; kind: 'widget';  widgetId: string; width; height }
  | { id; kind: 'video';                     width; height }
  | { id; kind: 'section'; label?;           width; height };  // transparente

interface ExportBoard {
  aspect; resolution; videoMode: 'hidden' | 'flow' | 'background';
  panel: 'translucent' | 'none';  // solo aplica con videoMode 'background'
  supersample; lineScale; showLabel; background; items: ExportItem[];
}
computeBoardLayout(board, source?, outputSize?) → ExportLayout   // rects en px
skylinePack(entries)                             // empaquetado staggered
defaultItemWidth(aspect)                         // w6 en 16:9, w12 en el resto
createDefaultBoard(aspect, widgets, hasVideo)    // única plantilla inicial
normalizeBoard(raw, hasVideo)                    // compat. y valores por defecto
```

- Empaqueta los ítems con **skyline/bottom-left** en una rejilla de 12 columnas
  (rellena huecos; *staggered*).
- La **unidad de fila** se auto-ajusta para que la columna más alta **llene** el
  lienzo; con el vídeo de ancho libre se resuelve por **iteración**.
- **Alinear a izquierda/derecha** sobre el vídeo se hace con `section` (p. ej.
  `[sección 6][widget 6]` alinea a la derecha; `[sección 12 h4]` empuja hacia abajo).
- El vídeo `background` se saca del flujo y se dibuja **a sangre** por detrás.
- Dimensiones siempre **pares** (`yuv420p`).

## Compositor offscreen (`ExportStage`)

`src/renderer/src/lib/export-stage.tsx`:

- Monta los widgets del board en un contenedor oculto a tamaño de celda ×
  `supersample`, con un **`FrameBus` dedicado**; al publicar el frame los widgets
  se repintan **de forma síncrona** (`setWidgetDrawImmediate`), sin depender de `rAF`.
- Captura el **canvas de cada widget** a su rect dentro de la celda y, sobre él, el
  **chrome HTML** (leyenda de la gráfica temporal, readout del minimapa) leyendo
  los textos que el widget actualiza por frame. El vídeo se dibuja siempre con
  `contain` (letterbox); `section` no dibuja nada.
- **Modo directo** (`live`): las gráficas avanzan con el vídeo —página que crece
  desde la izquierda y luego se desplaza— (ver `docs/08`).

## Asistente en 2 pasos

`ExportDialog` es un asistente:

1. **Layout**: **etiqueta de sesión** (si el campo está vacío no se dibuja la
   franja) junto con **aspect ratio**, **vídeo** (Oculto/Primer plano/Segundo
   plano) y **añadir**, todo en **una sola fila**; después el editor del board
   (panel, quitar/redimensionar) y el slider de previsualización (por defecto, el
   punto medio del rango de exportación). Botones: *Cerrar* · *Siguiente*.
2. **Salida**: **previsualización del frame medio** del rango (mismo compositor,
   ajustada al contenido, sin fondo negro) y dos filas de ajustes:
   **Resolución · FPS (30/60) · Calidad (CRF) · Preset** y
   **Grosor de línea · Supersampling · Modo de gráficas · Ventana**. Debajo, el
   **slider start–end** de exportación sobre toda la duración del vídeo, con la
   **banda amarilla fija de telemetría** (recortable/prolongable). Los ajustes de
   salida **no** cambian el reparto del layout. Los campos se disponen en filas
   lógicas que reparten el ancho y se reajustan al redimensionar la ventana
   (`.dialog-grid`). Botones: *Cerrar* · *← Atrás* · *Exportar…*.

Los ajustes de **Calidad (CRF)**, **Preset**, **Supersampling**, **Modo de
gráficas**, **Ventana** y **Rango de exportación** incluyen un icono **`i`** con una
explicación emergente. La **Resolución** de salida ofrece `720p`, `1080p`, `1440p`
y `2160p`.

**Persistencia**: lo que vive en el `ExportBoard` (`aspect`, `resolution`,
`videoMode`, `panel`, `supersample`, `lineScale`, `showLabel`, `background`, `items`)
se guarda con el layout y la sesión. Son **locales del diálogo** (no se persisten):
`fps`, `crf`, `preset`, `modo de gráficas` (live/full), `liveWindowMs` y el rango
start–end.

**Salida**: la UI fija **MP4 + H.264** (`format: 'mp4'`, `codec: 'h264'`); `webm`/VP9
existen en `ExportConfig`/`buildFfmpegArgs` pero no se ofrecen. La exportación se
bloquea si el board no tiene ítems (`noItems`).

Ficheros implicados: `ExportDialog.tsx` (asistente), `ExportBoardEditor.tsx` (paso 1),
`ExportFramePreview.tsx` (paso 2), `RangeSlider.tsx` (rango start–end), `InfoHint.tsx`
(iconos `i`) y `lib/telemetry-range.ts` (rango de telemetría ↔ vídeo).

**Exportación directa**: *Exportar…* abre un `dialog.showSaveDialog` nativo
(`export:choose-destination`) con un nombre por defecto
(`telemetria_<sesión>_<fecha>.mp4`) y FFmpeg escribe **directamente** en la ruta
elegida (sin temporales ni copia). Si se cancela o falla, se **borra el fichero
parcial**.

## Orquestador (renderer)

`src/services/video-exporter.ts` → `exportVideo(config, onProgress?, signal?)`:
por frame hace `seekVideo`, calcula el timestamp de telemetría con
**`videoSynchronizer.mapTime`** (vídeo → telemetría, respeta anclaje/drift) y
compone. Envía cada frame como raw RGBA y reporta progreso (`percent`,
`currentFrame`, `totalFrames` y `etaMs`; el ETA es la media móvil acumulada de
ms/frame, descartando el primer frame por warm-up). `config.outputPath` se pasa a
`export:start`, que lanza FFmpeg hacia ese destino.

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

- Unit: `tests/unit/shared/export-composition.test.ts` (board, `createDefaultBoard`,
  vídeo background, secciones, migraciones de `normalizeBoard`),
  `tests/unit/shared/export-args.test.ts`.
- Integración: `tests/integration/export-ffmpeg.test.ts` (MP4 real con ffprobe).
- E2E: `e2e:export` (compone, envía frames y cancela a mitad).
