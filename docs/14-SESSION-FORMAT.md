# Formato de Sesión (Session File)

## Concepto

Una **Sesión** es el resultado de capturar telemetría sincronizada con un vídeo
pregrabado. Contiene todo lo necesario para reabrir el análisis exacto: telemetría,
vídeo, configuración de sincronización y layout de widgets.

## Estructura de Carpetas

```
mi-sesion/
├── session.json     # Telemetría (compacta) + sync + layout
└── robot_run.mp4    # Copia del vídeo
```

## Flujo de Creación

1. Cargar vídeo + conectar serial (o cargar una sesión).
2. Auto-layout según el schema descubierto; el usuario configura los widgets.
3. Al cesar los datos, "Guardar sesión" crea la carpeta con `session.json` + copia del vídeo.

## Especificación del Formato JSON

```typescript
// src/core/types/session.ts
const SESSION_VERSION = 1;

interface SessionFile {
  v: 1;
  name: string;
  created: string;          // ISO 8601
  video: SessionVideo;
  sync: SessionSync;
  telemetry: SessionTelemetry;
  layout: SessionLayout;
  /** Board del editor de exportación (opcional; ausente en sesiones antiguas). */
  export?: ExportBoard;
}

interface SessionVideo {
  file: string;             // nombre del vídeo ('' si no hay)
  fps: number;
  duration_s: number;
  resolution: [number, number];
}

interface SessionSync {
  offset_ms: number;        // drift manual
  anchor: [number, number] | null; // [videoTime_s, telemetryTime_ms]
  rate: number;             // 0.1–2.0
}

interface SessionTelemetry {
  schema: SessionFieldSchema[];
  frames: SessionFrameValue[][]; // [timestamp_ms, valor_1, valor_2, ...]
  /** false si la captura no tenía timestamps (tiempo = índice de muestra). Ausente = true. */
  timestamped?: boolean;
}

/** Valores permitidos en un frame de sesión. */
type SessionFrameValue = number | boolean | string | number[] | null;

/**
 * Schema compacto por tipo:
 * - "number":  [nombre, "number", unidad?, min?, max?]
 * - "bitmask": [nombre, "bitmask", bits]
 * - "boolean": [nombre, "boolean"]
 * - "string":  [nombre, "string"]
 * - "array":   [nombre, "array", longitud]
 */
type SessionFieldSchema =
  | [string, 'number']
  | [string, 'number', string]
  | [string, 'number', string, number, number]
  | [string, 'bitmask', number]
  | [string, 'boolean']
  | [string, 'string']
  | [string, 'array', number];

interface SessionLayout {
  widgets: SessionWidget[];
}

interface SessionWidget {
  id?: string;              // id estable (lo usan las referencias del board de export)
  t: string;                // tipo de widget ("TimeSeriesChart", ...)
  size: [number, number];   // [columnas, filas]
  fields: string[];
  config?: Record<string, unknown>;
}
```

`export` es el board del editor de exportación (`ExportBoard` de
`src/shared/export-composition.ts`): lista ordenada de ítems (`widget` | `video` |
`section`) en rejilla de 12 columnas. Ver `docs/09-VIDEO-EXPORT.md`. Es
**opcional**: si falta, se usa un preset por defecto.

### Ejemplo

```json
{
  "v": 1,
  "name": "Siguelíneas - Entrenamiento 3",
  "created": "2026-01-15T10:30:00Z",
  "video": { "file": "robot_run.mp4", "fps": 30, "duration_s": 10, "resolution": [1920, 1080] },
  "sync": { "offset_ms": 0, "anchor": [1.0, 0], "rate": 1 },
  "telemetry": {
    "schema": [["ir_sensors", "bitmask", 16], ["speed_rpm", "number", "RPM"]],
    "frames": [[0, 43690, 1200], [10, 43690, 1250]]
  },
  "layout": {
    "widgets": [
      { "t": "DigitalBitmask", "size": [12, 3], "fields": ["ir_sensors"], "config": { "ledsPerRow": 16, "rows": 1 } },
      { "t": "TimeSeriesChart", "size": [12, 6], "fields": ["speed_rpm"] }
    ]
  }
}
```

## Codec (codificar/decodificar)

`src/core/session-codec.ts`

```typescript
decodeSession(json): SessionFile        // valida v===1 y telemetry
encodeSession(session): string

decodeFieldSchema(schema): FieldSchema[]      // compacto → FieldSchema[]
encodeFieldSchema(schema): SessionFieldSchema[] // FieldSchema[] → compacto

sessionToDataset(session): TelemetryDataset
datasetToSession(dataset, video, sync, widgets): SessionFile
datasetToSessionTelemetry(dataset): SessionTelemetry
```

`toFrameValue(value)` preserva `null`, `boolean`, `string` y arrays/typed arrays
(estos últimos se serializan como `number[]`).

## Servicio de Sesiones

`src/services/session-manager.ts` (`sessionManager`), desacoplado mediante un
`SessionStorageAdapter` (no importa `electron`):

```typescript
readSession(jsonPath): Promise<SessionFile>
resolveVideoPath(jsonPath, videoFile): Promise<string>
saveSession(session, outputDir, videoPath): Promise<string>
listSessions(directory): Promise<SessionInfo[]>
```

La orquestación de UI vive en `src/renderer/src/lib/session-actions.ts`
(`openSessionDialog`, `loadSession`, `saveSession`, `closeVideo`).

## Reglas de negocio

- **Guardado**: se guarda con los datos capturados hasta el momento, sin cerrar el
  puerto. Para no cortar una captura en curso, el guardado se **bloquea mientras se
  reciben datos** y se **habilita** al desconectar o tras **2 s de silencio**
  (`STALE_TRANSMISSION_MS = 2000`). Con el puerto abierto pero sin datos, la barra de
  estado muestra el Serial como **"en reposo"**.
- **Reinicio de transmisión**: al reanudar tras "en reposo" (silencio ≥ 2 s) o al
  recibir un frame con `t = 0`, se descartan los frames anteriores y las gráficas se
  repintan desde el principio, conservando layout y schema
  (`SerialUARTParser.resetFrames()`). Solo afecta al dataset **primario**
  (`TelemetryStore.clearPrimary()`): en comparación, la sesión comparada no se resetea.
- **Vídeo no reproducible** (p. ej. HEVC): se transcodea a H.264 antes de cargarlo.

## Handlers IPC

`src/main/ipc-handlers.ts`: `session:export`, `session:read`, `session:getVideoPath`,
`session:list`, `file:read`.
