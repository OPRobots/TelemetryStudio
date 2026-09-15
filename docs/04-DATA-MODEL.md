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
  | number[]        // Array: sensores IR [1,0,1,1,0,1,0,1]
  | Int8Array       // ArrayBuffer view para datos binarios
  | Uint8Array
  | Uint16Array
  | Float32Array
  | null;           // Valor no disponible en este frame
```

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
  type: 'number' | 'boolean' | 'array' | 'bitmask';

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

  /** Timestamp de la vista actual del video (en ms desde inicio de la app) */
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

  /** Configuración global del dashboard */
  global: GlobalConfig;
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

  /** Posición y tamaño en el grid */
  x: number;
  y: number;
  width: number;
  height: number;

  /** Campos de telemetría que este widget visualiza */
  dataFields: string[];

  /** Configuración específica del widget (varying por tipo) */
  config: Record<string, unknown>;

  /** Si el widget está visible */
  visible: boolean;

  /** Orden de apilamiento (z-index) */
  zIndex: number;
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
  'comparison:sync-mode-change': { sharedBar: boolean };
  'comparison:widget-mismatch': { differences: string[] };

  // === Eventos de Exportación ===
  'export:start': { config: ExportConfig };
  'export:progress': { percent: number; currentFrame: number; totalFrames: number };
  'export:complete': { outputPath: string };
  'export:error': { message: string };

  // === Eventos de Sistema ===
  'system:error': { source: string; message: string; stack?: string };
  'system:log': { level: 'info' | 'warn' | 'error'; message: string };
}
```

## ExportConfig — Configuración de Exportación

```typescript
// src/core/types/video.ts (continuación)

/**
 * Configuración para la exportación de vídeo.
 */
interface ExportConfig {
  /** Ruta de salida del archivo */
  outputPath: string;

  /** Formato de salida */
  format: 'mp4' | 'webm';

  /** Codec de vídeo */
  codec: 'h264' | 'vp9';

  /** Frames por segundo del vídeo exportado */
  fps: number;

  /** Resolución de salida */
  width: number;
  height: number;

  /** Bitrate en bits por segundo */
  bitrate: number;

  /** Intervalo de keyframes en segundos */
  keyframeInterval_s: number;

  /** Frame de inicio (índice en el dataset) */
  startFrame: number;

  /** Frame de fin (índice en el dataset) */
  endFrame: number;

  /** Widgets a incluir en la composición */
  includedWidgets: string[];

  /** Si incluir el vídeo base */
  includeBaseVideo: boolean;

  /** Si incluir overlays sobre el vídeo */
  includeOverlays: boolean;

  /** Etiqueta de sesión para el overlay (e.g., "Entreno 3") */
  sessionLabel?: string;
}
```

## ComparisonConfig — Configuración de Comparación Side-by-Side

```typescript
// src/core/types/comparison.ts

/**
 * Configuración para el modo de comparación side-by-side.
 * Permite ver 2 sesiones simultáneamente con interfaz duplicada verticalmente.
 */
interface ComparisonConfig {
  /** Si la comparación está activa */
  enabled: boolean;

  /** Dataset de referencia (sesión A — la que ya está cargada) */
  referenceDataset: TelemetryDataset | null;

  /** Ruta al vídeo de la sesión de referencia */
  referenceVideoPath: string | null;

  /** Configuración de sync de la sesión de referencia */
  referenceSync: SessionSync | null;

  /** Layout de widgets de la sesión de referencia */
  referenceLayout: SessionLayout | null;

  /** Si la barra vertical está sincronizada entre ambas sesiones */
  /** true = mover la barra en A se mueve también en B */
  /** false = cada sesión tiene su propia barra */
  sharedVerticalBar: boolean;
}

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
