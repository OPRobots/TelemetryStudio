# Modelo de Datos

## TelemetryFrame — Unidad Fundamental de Datos

Cada instante de telemetría se representa como un `TelemetryFrame`. Es la unidad mínima de intercambio entre parsers, EventBus y widgets.

```typescript
// src/core/types/telemetry.ts

/**
 * Un fotograma individual de telemetría.
 * Representa el estado completo del robot en un instante dado.
 */
interface TelemetryFrame {
  /** Timestamp en milisegundos desde el inicio de la grabación */
  timestamp_ms: number;

  /** Datos del sensor/actuador como mapa genérico */
  data: Record<string, TelemetryValue>;
}

/**
 * Valores permitidos en un TelemetryFrame.
 * Soporta tipos escalares, arrays y bitmasks.
 */
type TelemetryValue =
  | number          // Escalar: temperatura, velocidad, PID output
  | boolean         // Booleano: LED on/off, sensor trigger
  | string          // Etiqueta de texto: estados ("RUNNING", "IDLE")
  | number[]        // Array: sensores IR [1,0,1,1,0,1,0,1]
  | Int8Array       // ArrayBuffer view para datos binarios
  | Uint8Array
  | Uint16Array
  | Float32Array
  | null;           // Valor no disponible en este frame
```

Los campos de tipo `string` son etiquetas de texto (típicamente estados). El parser
serial los detecta cuando el valor de un campo no es número, booleano ni hexadecimal;
el `StateTimeline` los usa directamente como etiqueta.

## TelemetryDataset — Colección de Frames

```typescript
/**
 * Conjunto completo de telemetría cargado desde un archivo o streaming.
 */
interface TelemetryDataset {
  /** Identificador único del dataset */
  id: string;

  /** Nombre descriptivo (nombre del archivo o "Serial Stream") */
  name: string;

  /** Todos los frames ordenados por timestamp_ms ASC */
  frames: TelemetryFrame[];

  /** Esquema de campos: qué datos contiene cada frame */
  schema: FieldSchema[];

  /** Timestamp del primer frame (ms) */
  startTime_ms: number;

  /** Timestamp del último frame (ms) */
  endTime_ms: number;

  /** Duración total en milisegundos */
  duration_ms: number;

  /** Frecuencia de muestreo promedio calculada (Hz) */
  avgSampleRate_hz: number;

  /** Total de frames */
  frameCount: number;

  /** Fuente de datos */
  source: DataSource;
}

/**
 * Descripción de un campo de datos dentro de un TelemetryFrame.
 */
interface FieldSchema {
  /** Nombre del campo (e.g., "ir_sensors", "pid_output", "speed_rpm") */
  name: string;

  /** Tipo de dato */
  type: 'number' | 'boolean' | 'string' | 'array' | 'bitmask';

  /** Unidad de medida (opcional) */
  unit?: string;

  /** Valor mínimo esperado (para auto-escalado de gráficas) */
  min?: number;

  /** Valor máximo esperado */
  max?: number;

  /** Descripción legible */
  label?: string;

  /** Para arrays: longitud del array */
  arrayLength?: number;

  /** Para bitmasks: número de bits */
  bitmaskWidth?: number;

  /** Categoría del widget recomendado para visualizar este campo */
  recommendedWidget?: 'timeseries' | 'bitmask' | 'minimap' | 'timeline';
}

/**
 * Origen de los datos de telemetría.
 */
type DataSource =
  | { type: 'session'; sessionName: string; path: string }
  | { type: 'serial'; port: string; baudRate: number };
```

## VideoFrameContext — Estado de Reproducción del Vídeo

```typescript
// src/core/types/video.ts

/**
 * Contexto completo del frame de vídeo actual.
 * Se actualiza en cada `requestVideoFrameCallback`.
 */
interface VideoFrameContext {
  /** Tiempo actual del vídeo en segundos (video.currentTime) */
  currentTime_s: number;

  /** PTS (Presentation Timestamp) del frame actual en segundos */
  /** Usar este valor para sincronización, NO currentTime */
  mediaTime_s: number;

  /** Número de frame presentado desde el inicio */
  presentedFrames: number;

  /** Duración total del vídeo en segundos */
  duration_s: number;

  /** Velocidad de reproducción actual */
  playbackRate: number;

  /** Si el vídeo está reproduciéndose o en pausa */
  isPlaying: boolean;

  /** Resolución del vídeo */
  videoWidth: number;
  videoHeight: number;

  /** Frame rate declarado del vídeo (e.g., 30, 60) */
  declaredFps: number;

  /** Timestamp de telemetría mapeado desde el frame de vídeo (ms), tras drift/anchor */
  viewTimestamp_ms: number;
}

/**
 * Estado de reproducción persistente.
 */
interface PlaybackState {
  /** Offset manual de drift en milisegundos */
  driftOffset_ms: number;

  /** Anchor point: timestamp_ms del frame de vídeo que marca t=0 */
  anchorPoint_videoFrame: number | null;

  /** Anchor point: timestamp_ms del frame de telemetría correspondiente */
  anchorPoint_telemetryFrame: number | null;

  /** Velocidad de reproducción (0.1 a 2.0) */
  playbackRate: number;

  /** Si está en modo loop */
  loopEnabled: boolean;
}
```

## DashboardLayout — Persistencia de Layouts

```typescript
// src/core/types/layout.ts

/**
 * Layout completo del dashboard guardado en JSON.
 */
interface DashboardLayout {
  /** Versión del schema (para migraciones futuras) */
  version: 1;

  /** Nombre del layout */
  name: string;

  /** Descripción (opcional) */
  description?: string;

  /** Timestamp de creación */
  createdAt: string;

  /** Timestamp de última modificación */
  modifiedAt: string;

  /** Configuración del layout del vídeo */
  videoPanel: VideoPanelConfig;

  /** Lista de widgets con sus posiciones y configuraciones */
  widgets: WidgetConfig[];

  /** Tamaños y visibilidad de los paneles de la interfaz */
  panels: LayoutPanels;

  /** Configuración global del dashboard */
  global: GlobalConfig;

  /** Board del editor de exportación (opcional; lo usan ExportDialog y la sesión) */
  exportBoard?: ExportBoard; // @shared/export-composition
}

/**
 * Tamaños y visibilidad de los paneles (se guardan con el layout).
 */
interface LayoutPanels {
  /** Ancho del inspector en píxeles (200–480) */
  inspectorWidth: number;
  /** Si el inspector está visible */
  inspectorVisible: boolean;
  /** Proporción de alto del vídeo respecto a la columna (0.15–0.8) */
  videoRatio: number;
  /** Proporción de ancho del panel A en comparación (0.3–0.7) */
  comparisonRatio: number;
}

/**
 * Configuración del panel de vídeo.
 */
interface VideoPanelConfig {
  /** Posición en el grid */
  x: number;
  y: number;
  width: number;
  height: number;

  /** Si se muestran overlays sobre el vídeo */
  showOverlays: boolean;

  /** Lista de overlays activos */
  overlays: OverlayConfig[];
}

/**
 * Configuración de un widget individual.
 */
interface WidgetConfig {
  /** ID único del widget (se genera al crear) */
  id: string;

  /** Tipo de widget registrado en el WidgetRegistry */
  type: string;

  /** Nombre descriptivo del widget */
  label: string;

  /** Ancho en columnas de la rejilla (3..12; presets 12/9/8/6/4/3) */
  width: number;

  /** Alto en filas de la rejilla (2..16; fila = 40px) */
  height: number;

  /** Campos de telemetría que este widget visualiza */
  dataFields: string[];

  /** Configuración específica del widget (varying por tipo) */
  config: Record<string, unknown>;

  /** Si el widget está visible */
  visible: boolean;
}

/**
 * Overlay que se superpone al vídeo.
 */
interface OverlayConfig {
  /** Tipo de overlay */
  type: 'speed' | 'state' | 'vector' | 'custom';

  /** Posición en el vídeo */
  position: { x: number; y: number };

  /** Campo de telemetría que muestra */
  dataField: string;

  /** Configuración visual */
  style: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
  };
}

/**
 * Configuración global del dashboard.
 */
interface GlobalConfig {
  /** Tema de color */
  theme: 'dark' | 'light';

  /** Unidades de medida */
  units: {
    speed: 'm/s' | 'cm/s' | 'rpm';
    distance: 'm' | 'cm' | 'mm';
    angle: 'deg' | 'rad';
  };

  /** Si se muestran las líneas de grid */
  showGrid: boolean;

  /** Si los widgets se snapping al grid */
  snapToGrid: boolean;

  /** Tamaño de celda del grid (px) */
  gridSize: number;
}
```

## EventMap — Tipos de Eventos del Bus

```typescript
// src/core/types/events.ts

/**
 * Mapa de todos los eventos del EventBus con sus payloads.
 * Tipo-safe: al emitir un evento, TypeScript valida el payload.
 */
interface EventMap {
  // === Eventos de Datos ===
  'data:loaded': { dataset: TelemetryDataset };
  'data:frame': { frame: TelemetryFrame; index: number };
  'data:streaming-start': { source: DataSource };
  'data:streaming-stop': {};
  'data:streaming-frame': { frame: TelemetryFrame };

  // === Eventos de Vídeo ===
  'video:loaded': { duration_s: number; fps: number; width: number; height: number };
  'video:frame': { context: VideoFrameContext };
  'video:play': {};
  'video:pause': {};
  'video:seek': { time_s: number };
  'video:rate-change': { rate: number };

  // === Eventos de Sincronización ===
  'sync:frame': { frame: TelemetryFrame; context: VideoFrameContext };
  'comparison:frame': { frame: TelemetryFrame; context: VideoFrameContext };
  'sync:anchor-set': { videoFrame: number; telemetryFrame: number };
  'sync:offset-change': { offset_ms: number };
  'sync:rate-change': { rate: number };

  // === Eventos de UI ===
  'ui:widget-add': { widgetConfig: WidgetConfig };
  'ui:widget-remove': { widgetId: string };
  'ui:widget-update': { widgetId: string; config: Partial<WidgetConfig> };
  'ui:layout-load': { layout: DashboardLayout };
  'ui:layout-save': { layout: DashboardLayout };

  // === Eventos de Comparación ===
  'comparison:start': { referenceSession: SessionFile; referenceDataset: TelemetryDataset };
  'comparison:stop': {};
  'comparison:widget-mismatch': { differences: string[] };

  // === Eventos de Exportación ===
  'export:start': { config: ExportConfig };
  'export:progress': {
    percent: number;
    currentFrame: number;
    totalFrames: number;
    etaMs: number | null; // tiempo restante estimado (null sin muestra fiable)
  };
  'export:complete': { outputPath: string };
  'export:error': { message: string };

  // === Eventos de Sistema ===
  'system:error': { source: string; message: string; stack?: string };
  'system:log': { level: 'info' | 'warn' | 'error'; message: string };
}
```

> **Nota:** varios eventos del mapa están **reservados y hoy no se emiten** en `src/`
> (`data:frame`, `data:streaming-start/stop`, `video:loaded/frame/play/pause`,
> `video:rate-change`, `export:start/progress/complete/error`, `system:error/log`).
> El progreso de exportación se entrega por **callback** (`exportVideo(config, onProgress)`)
> y no por el EventBus. Los eventos vivos principales son `data:loaded`,
> `data:streaming-frame`, `sync:*`, `sync:frame`/`comparison:frame`,
> `video:seek`, `ui:*` y `comparison:*`.

## ExportConfig — Configuración de Exportación

```typescript
// src/core/types/video.ts

/**
 * Configuración para la exportación de vídeo.
 *
 * La composición (board de ítems, resolución y placement del vídeo) vive en
 * `layout` (@shared/export-composition); los widgets se renderizan a tamaño de
 * celda en un host oculto y se captura su canvas. El tamaño final de salida es
 * `layout.width` × `layout.height`.
 */
interface ExportConfig {
  /** Ruta de destino elegida por el usuario (se escribe directamente ahí) */
  outputPath: string;
  format: 'mp4' | 'webm';
  codec: 'h264' | 'vp9';
  fps: number;
  /** Calidad CRF (menor = mejor) */
  crf?: number;
  /** Preset de libx264 */
  preset?: string;
  startFrame: number;
  endFrame: number;
  /** Layout de composición calculado (incluye ancho/alto finales) */
  layout: ExportLayout;
  /** Widgets disponibles para renderizar (los referenciados por el layout) */
  widgets: CompositionWidget[];
  includeOverlays: boolean;
  sessionLabel?: string;
  /** Modo directo (replay): las gráficas avanzan con el vídeo */
  live?: boolean;
  /** Ventana visible (ms) del modo directo */
  liveWindowMs?: number;
}
```

> La UI del asistente fija `format: 'mp4'` y `codec: 'h264'`; `webm`/`vp9` existen
> en el tipo y en `buildFfmpegArgs`, pero no se ofrecen en la interfaz.

## Modelo del board de exportación (`@shared/export-composition`)

Módulo **puro** (sin DOM) que traduce el board a rectángulos en píxeles:

```typescript
interface ExportBoard {
  aspect: '16:9' | '9:16' | '1:1' | '4:5';
  resolution: '720p' | '1080p' | '1440p' | '2160p';
  videoMode: 'hidden' | 'flow' | 'background';
  panel: 'translucent' | 'none'; // solo con videoMode 'background'
  supersample: number;           // 1 o 2
  lineScale: number;             // grosor de líneas solo en exportación
  showLabel?: boolean;           // franja superior con la etiqueta de sesión
  background: string;
  items: ExportItem[];           // widget | video | section (rejilla 12 col)
}

interface ExportLayout {
  width: number; height: number;
  background: string;
  supersample: number;
  lineScale: number;
  backgroundVideoRect: Rect | null; // vídeo a sangre (videoMode 'background')
  labelRect: Rect | null;           // franja de etiqueta
  copyrightRect: Rect;              // franja de copyright (siempre)
  items: PlacedItem[];              // ítems con rect en px
}
```

- `computeBoardLayout(board, source?)` empaqueta los ítems con **skyline/staggered** y
  resuelve el tamaño de salida a partir del aspecto y la resolución.
- `createDefaultBoard(aspect, widgets, hasVideo)` / `normalizeBoard(raw, hasVideo)`
  (esta última migra formatos antiguos: `source`→`1080p`, `custom`→`16:9`).
- `resolveOutputSize(resolution, ratio)` da el tamaño (dimensiones pares) según el
  **lado corto** del preset.

## Modelo de sesión (`@core/types/session`)

El formato compacto en disco se define en `src/core/types/session.ts` y se
codifica/decodifica en `src/core/session-codec.ts` (ver `docs/14-SESSION-FORMAT.md`):

```typescript
const SESSION_VERSION = 1;

interface SessionFile {
  v: 1;
  name: string;
  created: string;          // ISO
  video: SessionVideo;      // { file, fps, duration_s, resolution: [w,h] }
  sync: SessionSync;        // { offset_ms, anchor: [video_s, telemetry_ms] | null, rate }
  telemetry: SessionTelemetry; // { schema: tuple[], frames: [ts, ...vals][], timestamped? }
  layout: SessionLayout;    // { widgets: SessionWidget[] }
  export?: ExportBoard;     // board de exportación (opcional, sesiones nuevas)
}
```

## WidgetCompatibilityResult — Validación de Compatibilidad de Widgets

La comparación (A izquierda / B derecha, con divisor vertical, reproducción, scroll,
cursor y zoom sincronizados) exige **widgets idénticos** entre ambas sesiones,
comparados **posición a posición** (tipo, campos, tamaño y configuración del mismo
índice); reordenar los widgets las hace incompatibles aunque el conjunto sea igual.

```typescript
// src/core/types/comparison.ts

/**
 * Resultado de la validación de compatibilidad de widgets entre sesiones.
 */
interface WidgetCompatibilityResult {
  /** Si los widgets son compatibles (idénticos) */
  compatible: boolean;

  /** Lista de diferencias encontradas (vacía si compatible) */
  differences: string[];

  /** Widgets de la sesión A */
  sessionAWidgets: SessionWidget[];

  /** Widgets de la sesión B */
  sessionBWidgets: SessionWidget[];
}
```
