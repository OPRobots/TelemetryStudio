# Sistema de Widgets

> **Colocación (rejilla fluida)**: los widgets se colocan en una rejilla de 12
> columnas con flujo tipo Bootstrap (no *masonry*). Cada widget tiene `width`
> (columnas: 12/9/8/6/4/3) y `height` (filas de 40px, 2–16). El **orden** es el
> de la lista (no hay x/y).
>
> - **Ancho por defecto**: ancho completo (12). Se redimensiona arrastrando el
>   **asa derecha** (snap a presets: 12/9/8/6/4/3).
> - **Alto**: arrastrando el **asa inferior**, a saltos de fila (40px), con mínimo
>   2 y máximo 16 filas.
> - **Reordenar**: arrastrando la **cabecera** del widget (salvo ⚙/✕); los widgets
>   se refluyen automáticamente.
> - El diálogo de configuración ofrece un **respaldo compacto** (presets de ancho
>   y stepper de alto).
>
> **Sección de UI**: la card que contiene los widgets se muestra como
> **"Telemetría"** y el botón para añadirlos es **"+ Añadir gráfica"**. El panel de
> **Vídeo** aparece solo cuando hay un vídeo cargado; sin vídeo, la zona de
> telemetría ocupa toda la ventana (modo sin vídeo, válido para telemetría
> capturada sin grabación de vídeo).
>
> **Scroll**: la rejilla ocupa el alto disponible de la card "Telemetría" y hace
> **scroll vertical** cuando los widgets no caben, con una barra **fina** (8px,
> `::-webkit-scrollbar` con colores del tema) en vez de la scrollbar clásica.
>
> **Estado de implementación**: los widgets son componentes React (no clases).
> `WidgetHost` mantiene un `FrameBus` por panel (`src/widgets/frame-bus.ts`) que
> publica el frame/contexto sincronizado; los widgets se suscriben y se redibujan
> de forma **imperativa** (`src/widgets/use-widget-draw.ts`, coalescido por rAF),
> sin re-render de React por frame. Cada widget exporta una `WidgetDefinition`
> (`{ metadata, component }`) y se registra en `src/widgets/widget-registry.ts` vía
> `register-widgets.ts`. `WidgetHost` entrega a los widgets `getFrames()` (dataset
> actual), `hoverTimestamp_ms` y `onCursorHover`; cada widget resuelve el timestamp
> efectivo con `resolveViewTimestamp`. Los 4 widgets son: `TimeSeriesChart` (uPlot
> multi-serie con LTTB), `DigitalBitmask`, `Minimap2D` y `StateTimeline`.
> `StateTimeline` y `Minimap2D` cachean su capa estática en un canvas offscreen.

## Visión General

Los widgets son componentes visuales que se renderizan en canvas y se redibujan automáticamente con cada frame de telemetría sincronizado. Cada widget declara qué campos de datos necesita y se suscribe al EventBus.

## Cursor Temporal Compartido

Los cuatro widgets comparten un cursor temporal a través de un store Zustand
(`src/renderer/src/stores/cursor-store.ts`, `useCursorStore`):

- Publican el timestamp bajo el ratón al hacer hover (y `null` al salir) la
  **gráfica temporal** y la **StateTimeline**, mediante la prop `onCursorHover`.
  Así, mover el ratón sobre cualquiera de ellas desplaza los indicadores del
  resto (cursor del gráfico, LEDs, minimapa y otras timelines).
- `WidgetHost` entrega a cada widget el `hoverTimestamp_ms` (store) y el frame
  actual vía `FrameBus`; cada widget resuelve el **timestamp efectivo** con
  `resolveViewTimestamp`, con esta prioridad:
  `hover (gráfica o timeline) → context.viewTimestamp_ms (vídeo) → frame.timestamp_ms (streaming) → último frame`.
- `DigitalBitmask`, `StateTimeline` y `Minimap2D` muestran el valor / estado /
  posición **exactos** en ese timestamp. Sin hover y sin vídeo, muestran el
  último frame disponible.

La búsqueda del frame más cercano se hace con búsqueda binaria sobre el dataset
(`src/widgets/frame-lookup.ts`: `frameAt`, `frameIndexAt`, `valueAt`).

## Zoom Compartido

El mismo store guarda un `zoomRange` (`{ startMs, endMs } | null`) compartido por
todas las timelines (estado **global**, no se persiste en sesión/layout):

- **TimeSeriesChart**: al soltar un arrastre de zoom, uPlot aplica la escala y se
  publica ese rango desde su hook `setScale` (el rango de la store es la única
  verdad; reemplaza al antiguo zoom interno).
- **StateTimeline**: **arrastrar** sobre la barra selecciona un rango (con
  rectángulo translúcido) y lo publica; el hover se suspende durante el arrastre.
- **Doble clic** en cualquiera de las dos restablece la vista completa
  (`setZoomRange(null)`).
- **Minimap2D**: encuadra y centra el tramo del rango; la parte **fuera** del
  rango se dibuja con opacidad baja (~0.2) como contexto y la de **dentro**
  resaltada.
- **DigitalBitmask** no se acota: muestra el valor en `viewTimestamp`.
- Helpers puros en `src/widgets/zoom-range.ts` (`makeRange`, `isInRange`,
  `clampRange`, `isFullRange`).

## Comportamiento por Defecto

- **TimeSeriesChart**: muestra siempre **todo el dataset (t=0..final)**. El zoom
  por arrastre se conserva entre actualizaciones de datos; **doble clic**
  restablece la vista completa. El cursor vertical sigue la posición actual
  (`autoFollow`). Las series se muestrean con LTTB usando un **único conjunto de
  índices**, de modo que la X y todas las Y quedan alineadas por índice.
- **TimeSeriesChart · trazo**: las líneas se dibujan con `pxAlign: false`
  (anti-aliasing real, sin snap a píxel entero) y, con `smoothing > 0` (por
  defecto), con una **spline cúbica monótona** (`uPlot.paths.spline`): suaviza
  los valores cercanos y **no sobrepasa**, por lo que conserva los picos. El
  checkbox "Suavizar líneas" del diálogo lo controla.
- **Minimap2D**: ajusta la escala automáticamente para encuadrar **todo el
  recorrido**, centrado y con márgenes; el triángulo del robot (con orientación)
  se desplaza por la trayectoria según el timestamp visualizado.
- **DigitalBitmask**: por defecto muestra **todos los bits en una sola fila**
  (arrays de sensores de línea); el auto-layout y el alta desde el menú fijan
  `ledsPerRow` al ancho del campo y `rows = 1`.
- **DigitalBitmask** y **StateTimeline**: se repintan al cambiar de tamaño
  (`ResizeObserver` vía `src/widgets/use-canvas-size.ts`) y escalan su contenido
  proporcionalmente (rejilla de LEDs cuadrada y centrada; barra + etiqueta
  proporcionales al alto), en lugar de estirar el bitmap.
- **Paleta automática de colores** (`src/widgets/color-palette.ts`): cuando no
  hay colores configurados, los colores se asignan con **matiz por ángulo áureo**
  (estable por índice → no hay dos parecidos y no "bailan" al aparecer series o
  estados nuevos). Hay dos variantes:
  - `seriesPalette`: para las **líneas** del TimeSeriesChart; mantiene la paleta
    base viva original y extiende con tonos vivos si hay más series.
  - `statePalette`: para los **bloques** del StateTimeline; tonos **más
    oscuros**, porque un bloque de color claro resulta pesado.
  El widget y el diálogo usan la misma paleta, así que los colores coinciden.
## Ciclo de Vida de un Widget

```
1. WidgetHost renderiza <definition.component {...WidgetProps} /> por cada widget del layout
2. El widget se suscribe al FrameBus del panel y dibuja imperativamente (useWidgetDraw)
   al cambiar frame/frames/hover/zoom/tamaño, sin re-render de React por frame
3. onCursorHover publica el hover y zoomRange/onZoomRangeChange el zoom (compartidos)
4. Al desmontar se limpian listeners (ResizeObserver, listeners de ratón, uPlot)
```

Props reales (`src/widgets/interfaces.ts`): `widgetId`, `config`, `dataFields`, `getFrames`,
`hoverTimestamp_ms`, `onCursorHover`, `zoomRange`, `onZoomRangeChange`.

## Widget 1: TimeSeriesChart (uPlot)

`src/widgets/time-series-chart/index.tsx`

- Muestra **todo el dataset** (t=0..final); el arrastre hace **zoom compartido** y el
  **doble clic** lo restablece.
- Cursor vertical que sigue la reproducción (`autoFollow`).
- LTTB con un **único conjunto de índices** (X y todas las Y alineadas); `maxPoints` 2000.
- `pxAlign: false` (anti-aliasing) y `smoothing` (por defecto 1) = **spline cúbica
  monótona** (`uPlot.paths.spline`), que suaviza sin sobrepasar.
- Colores: `seriesPalette` (paleta viva original; extiende por ángulo áureo si hay más series).
- Config: `colors`, `yLabel`, `yMin`/`yMax`, `maxPoints`, `autoFollow`, `smoothing`.

## Widget 2: DigitalBitmask (Canvas 2D)

`src/widgets/digital-bitmask/index.tsx`

- Matriz de LEDs on/off con glow en los activos y valor hex.
- Por defecto **todos los bits en una sola fila** (`ledsPerRow` = ancho del campo, `rows = 1`).
- `toBitmask` acepta `number`, `boolean`, `array` y typed arrays.
- Muestra el valor en `viewTimestamp` (no se acota por el zoom).
- Responsive: se repinta al cambiar de tamaño (`useCanvasSize`) con rejilla cuadrada centrada.
- Config: `ledsPerRow`, `rows`, `onColor`/`offColor`/`backgroundColor`, `showBitIndex`, `showHexValue`.

## Widget 3: Minimap2D (Canvas 2D)

`src/widgets/minimap-2d/index.tsx`

- Encuadra **todo el recorrido** con escala adaptativa; el **triángulo** (con orientación)
  se coloca en la posición del timestamp visualizado.
- Con **zoom**: encuadra el tramo del rango y dibuja lo de fuera con opacidad baja (~0.2);
  rejilla adaptativa para que no quede densa.
- Config: `fieldX`/`fieldY`/`fieldTheta` (derivados de los campos de datos),
  `trailColor`, `robotColor`, `robotLength`/`robotWidth`, `showGrid`, `gridSize`.
  El diálogo de configuración expone rejilla, tamaño/colores del robot y color de trayectoria.
- **Pan/zoom manual** (vista local, no persistida): **rueda** = zoom hacia el cursor
  (0.5x–20x); **arrastrar** = desplazar; **doble clic** = reset de la vista. Es
  independiente por widget y no toca el `zoomRange` temporal compartido.

## Widget 4: StateTimeline (Canvas 2D)

`src/widgets/state-timeline/index.tsx` + `state-entry.ts`

- Acepta `number`, `boolean` y **`string`**: si el valor es texto, se usa como **etiqueta**.
- **Sin nombres por defecto**: si el valor no está en `config.stateMap`, se muestra `S<n>`
  (números) o el propio texto (strings), con color por índice (`statePalette`).
- `config.stateMap` (`Record<string,{ label, color }>`, clave = valor como texto) permite
  **renombrar y recolorear**; el diálogo incluye una sección **"Estados"** que detecta los
  valores del dataset para editarlos.
- Hover publica el cursor; **arrastrar** selecciona un rango de zoom; doble clic lo restablece.
- El texto del estado actual se aclara (`lighten`) para seguir legible sobre fondo oscuro.
- **Auto-layout**: crea **un `StateTimeline` por cada campo** que casa con
  `/^(state|state[_-].*|mode|status|fsm)$/i`, con etiqueta `Estado` / `Estado: <campo>`.

## Añadir un widget nuevo

1. Crear `src/widgets/mi-widget/index.tsx` exportando una `WidgetDefinition`
   (`{ metadata, component }`).
2. Registrarla en `src/widgets/register-widgets.ts`.
3. `metadata.acceptedFieldTypes` decide para qué tipos de campo se ofrece el widget; el
   `metadata.defaultConfig` se usa al añadirlo desde el menú.
