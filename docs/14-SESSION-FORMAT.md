# Formato de Sesión (Session File)

## Concepto

Una **Sesión** es el resultado de capturar telemetría sincronizada con un vídeo pregrabado. Contiene todo lo necesario para reabrir el análisis exacto: telemetría, vídeo, configuración de sincronización y layout de widgets.

## Estructura de Carpetas

```
~/OPRobots Sessions/                        ← Directorio base del usuario
├── Siguelíneas_Entrenamiento_3/            ← Nombre de sesión (usuario elige)
│   ├── session.json                        ← Todos los datos + settings
│   └── robot_run_03.mp4                    ← Copia del vídeo
├── Micromouse_Competicion_1/
│   ├── session.json
│   └── maze_run.mp4
└── ...
```

La app crea la carpeta al exportar y copia el vídeo junto al JSON. Al importar, busca el `.json` y carga el vídeo desde la misma carpeta.

## Flujo de Creación de Sesión

```
1. Usuario carga vídeo .mp4 → se establece como referencia temporal
2. (Serial) Se conecta al robot → streaming de telemetría en vivo
3. Al terminar el stream → schema de campos disponible con nombres
4. Usuario configura widgets → agrupa parámetros en gráficas
5. Usuario calibra sincronización → anchor point (frame vídeo = timestamp serial)
6. Usuario guarda sesión:
   - Introduce nombre (e.g., "Siguelíneas - Entreno 3")
   - Selecciona directorio de destino
   - Se crea carpeta con:
     * session.json (telemetría compacta + sync + layout)
     * copia del .mp4
7. La sesión queda lista para reabrir o comparar con otra
```

## Especificación del Formato JSON

### Versión del Schema

```typescript
// src/core/types/session.ts

/** Versión del formato de sesión (para migraciones futuras) */
const SESSION_VERSION = 1;
```

### SessionFile — Tipo Completo

```typescript
/**
 * Archivo de sesión completo.
 * Representa un análisis guardado con todo lo necesario para reabrirlo.
 */
interface SessionFile {
  /** Versión del schema */
  v: 1;

  /** Nombre de la sesión (e.g., "Siguelíneas - Entrenamiento 3") */
  name: string;

  /** Timestamp de creación (ISO 8601) */
  created: string;

  /** Información del vídeo */
  video: SessionVideo;

  /** Configuración de sincronización vídeo-telemetría */
  sync: SessionSync;

  /** Datos de telemetría */
  telemetry: SessionTelemetry;

  /** Layout del dashboard (widgets y distribución) */
  layout: SessionLayout;
}

/**
 * Información del vídeo asociado a la sesión.
 */
interface SessionVideo {
  /** Nombre del archivo de vídeo (e.g., "robot_run_03.mp4") */
  file: string;

  /** Duración en segundos */
  duration_s: number;

  /** Frames por segundo declarados */
  fps: number;

  /** Resolución [ancho, alto] */
  resolution: [number, number];
}

/**
 * Configuración de sincronización.
 */
interface SessionSync {
  /** Offset de drift en milisegundos (+/- ) */
  offset_ms: number;

  /** Anchor point: [videoTime_s, telemetryTime_ms] o null */
  anchor: [number, number] | null;

  /** Velocidad de reproducción (0.1 a 2.0) */
  rate: number;
}

/**
 * Datos de telemetría en formato compacto.
 */
interface SessionTelemetry {
  /** Esquema de campos: [nombre, tipo, ...extras] */
  schema: SessionFieldSchema[];

  /**
   * Frames en formato compacto array.
   * Cada frame es: [timestamp_ms, valor_campo_1, valor_campo_2, ...]
   *
   * Ejemplo para schema [ir_sensors, motor_left, speed_rpm]:
   * [0, 43690, 512, 1200]      ← frame en t=0ms
   * [10, 43690, 530, 1250]     ← frame en t=10ms
   */
  frames: number[][];
}

/**
 * Schema de campo en formato compacto.
 *
 * Formatos según tipo:
 * - "number":   [nombre, "number", unidad?, min?, max?]
 * - "bitmask":  [nombre, "bitmask", bits]
 * - "boolean":  [nombre, "boolean"]
 * - "string":   [nombre, "string"]
 * - "array":    [nombre, "array", longitud]
 */
type SessionFieldSchema =
  | [string, 'number']
  | [string, 'number', string]                    // con unidad
  | [string, 'number', string, number, number]    // con unidad, min, max
  | [string, 'bitmask', number]                   // con bits
  | [string, 'boolean']
  | [string, 'string']                            // etiqueta de texto
  | [string, 'array', number];                    // con longitud

/**
 * Layout del dashboard en formato compacto.
 */
interface SessionLayout {
  /** Widgets activos */
  widgets: SessionWidget[];
}

/**
 * Widget en formato compacto.
 */
interface SessionWidget {
  /** Tipo de widget (e.g., "TimeSeriesChart") */
  t: string;

  /** Tamaño [columnas, filas] */
  size: [number, number];

  /** Campos de datos que visualiza */
  fields: string[];

  /** Configuración específica del widget (opcional) */
  config?: Record<string, unknown>;
}
```

### Ejemplo Completo de Session File

```json
{
  "v": 1,
  "name": "Siguelíneas - Entrenamiento 3",
  "created": "2026-08-15T10:30:00Z",

  "video": {
    "file": "robot_run_03.mp4",
    "duration_s": 45.2,
    "fps": 30,
    "resolution": [1920, 1080]
  },

  "sync": {
    "offset_ms": 142,
    "anchor": [2.333, 2200],
    "rate": 1.0
  },

  "telemetry": {
    "schema": [
      ["ir_sensors", "bitmask", 16],
      ["motor_left", "number", "PWM", -1000, 1000],
      ["motor_right", "number", "PWM", -1000, 1000],
      ["speed_rpm", "number", "RPM", 0, 10000],
      ["gyro_z", "number", "°/s"],
      ["state", "number"],
      ["battery_pct", "number", "%", 0, 100],
      ["position_x", "number", "m"],
      ["position_y", "number", "m"],
      ["heading_deg", "number", "°", 0, 360]
    ],
    "frames": [
      [0, 43690, 512, -510, 1200, 15, 1, 85, 0.00, 0.00, 90.0],
      [10, 43690, 530, -525, 1250, 18, 1, 85, 0.05, 0.01, 91.2],
      [20, 43946, 545, -540, 1300, 12, 1, 84, 0.10, 0.03, 92.5],
      [30, 43946, 560, -555, 1350, -5, 1, 84, 0.16, 0.06, 93.1]
    ]
  },

  "layout": {
    "widgets": [
      {
        "t": "Minimap2D",
        "size": [6, 8],
        "fields": ["position_x", "position_y", "heading_deg"]
      },
      {
        "t": "DigitalBitmask",
        "size": [6, 4],
        "fields": ["ir_sensors"]
      },
      {
        "t": "TimeSeriesChart",
        "size": [6, 4],
        "fields": ["motor_left", "motor_right"],
        "config": {
          "colors": ["#22d3ee", "#4ade80"],
          "yLabel": "PWM"
        }
      },
      {
        "t": "StateTimeline",
        "size": [12, 3],
        "fields": ["state"]
      }
    ]
  }
}
```

## Comparativa de Tamaño

Para 10,000 frames con 10 campos numéricos cada uno:

| Formato | Tamaño aprox. | Tiempo parse | Notas |
|---|---|---|---|
| JSON minificado | ~2.5 MB | ~50ms | **Recomendado** — simplicidad + compatibilidad |
| JSON pretty-print | ~4 MB | ~50ms | Solo para debug |
| MessagePack | ~1.8 MB | ~30ms | Futura optimización si es necesario |
| Binario custom | ~1.2 MB | ~10ms | Solo si 2.5 MB es problema |

**Decisión**: JSON minificado. Si el tamaño se vuelve problema (>10 MB para sesiones muy largas), migrar a MessagePack con mínimo cambio de código (la interfaz `SessionFile` es la misma, solo cambia el serializer).

## TypeSafe Serialization/Deserialization

```typescript
// src/core/session-codec.ts

import type { SessionFile, SessionFieldSchema, TelemetryDataset, FieldSchema } from './types';

/**
 * Serializa un SessionFile a JSON string minificado.
 */
export function encodeSession(session: SessionFile): string {
  return JSON.stringify(session);
}

/**
 * Deserializa un JSON string a SessionFile con validación.
 * Lanza error si el schema no es válido.
 */
export function decodeSession(json: string): SessionFile {
  const raw = JSON.parse(json);

  // Validación básica
  if (raw.v !== 1) throw new Error(`Unsupported session version: ${raw.v}`);
  if (!raw.name || typeof raw.name !== 'string') throw new Error('Missing session name');
  if (!raw.video?.file) throw new Error('Missing video file');
  if (!Array.isArray(raw.telemetry?.frames)) throw new Error('Missing telemetry frames');
  if (!Array.isArray(raw.telemetry?.schema)) throw new Error('Missing telemetry schema');

  return raw as SessionFile;
}

/**
 * Convierte SessionTelemetry a TelemetryDataset (formato interno de la app).
 */
export function sessionToDataset(session: SessionFile): TelemetryDataset {
  const { schema, frames } = session.telemetry;

  // Convertir schema compacto a FieldSchema[]
  const fieldSchemas: FieldSchema[] = schema.map((s) => {
    const [name, type] = s;
    const base: FieldSchema = { name, type: type as FieldSchema['type'] };

    if (type === 'number') {
      if (s[2]) base.unit = s[2] as string;
      if (s[3] != null) base.min = s[3] as number;
      if (s[4] != null) base.max = s[4] as number;
    } else if (type === 'bitmask') {
      base.bitmaskWidth = s[2] as number;
    } else if (type === 'array') {
      base.arrayLength = s[2] as number;
    }

    return base;
  });

  // Convertir frames compactos a TelemetryFrame[]
  const telemetryFrames = frames.map((frame) => {
    const [timestamp_ms, ...values] = frame;
    const data: Record<string, any> = {};

    fieldSchemas.forEach((schema, i) => {
      data[schema.name] = values[i] ?? null;
    });

    return { timestamp_ms, data };
  });

  return {
    id: crypto.randomUUID(),
    name: session.name,
    frames: telemetryFrames,
    schema: fieldSchemas,
    startTime_ms: telemetryFrames[0]?.timestamp_ms ?? 0,
    endTime_ms: telemetryFrames[telemetryFrames.length - 1]?.timestamp_ms ?? 0,
    duration_ms: (telemetryFrames[telemetryFrames.length - 1]?.timestamp_ms ?? 0) -
                 (telemetryFrames[0]?.timestamp_ms ?? 0),
    avgSampleRate_hz: telemetryFrames.length > 1
      ? (telemetryFrames.length - 1) /
        (((telemetryFrames[telemetryFrames.length - 1]?.timestamp_ms ?? 0) -
          (telemetryFrames[0]?.timestamp_ms ?? 0)) / 1000)
      : 0,
    frameCount: telemetryFrames.length,
    source: { type: 'session', sessionName: session.name },
  };
}

/**
 * Convierte TelemetryDataset a formato de sesión compacto.
 */
export function datasetToSession(
  dataset: TelemetryDataset,
  videoInfo: { file: string; duration_s: number; fps: number; width: number; height: number },
  sync: { offset_ms: number; anchor: [number, number] | null; rate: number },
  layout: { widgets: Array<{ type: string; pos: [number, number]; size: [number, number]; fields: string[]; config?: Record<string, unknown> }> }
): SessionFile {
  // Convertir schema a formato compacto
  const schema: SessionFieldSchema[] = dataset.schema.map((s) => {
    if (s.type === 'number') {
      if (s.unit && s.min != null && s.max != null) {
        return [s.name, 'number', s.unit, s.min, s.max];
      }
      if (s.unit) return [s.name, 'number', s.unit];
      return [s.name, 'number'];
    }
    if (s.type === 'bitmask') return [s.name, 'bitmask', s.bitmaskWidth ?? 8];
    if (s.type === 'boolean') return [s.name, 'boolean'];
    if (s.type === 'array') return [s.name, 'array', s.arrayLength ?? 0];
    return [s.name, s.type as any];
  });

  // Convertir frames a formato compacto
  const fieldNames = dataset.schema.map((s) => s.name);
  const frames: number[][] = dataset.frames.map((f) => {
    return [f.timestamp_ms, ...fieldNames.map((name) => f.data[name] ?? 0)];
  });

  return {
    v: 1,
    name: dataset.name,
    created: new Date().toISOString(),
    video: {
      file: videoInfo.file,
      duration_s: videoInfo.duration_s,
      fps: videoInfo.fps,
      resolution: [videoInfo.width, videoInfo.height],
    },
    sync,
    telemetry: { schema, frames },
    layout: {
      widgets: layout.widgets.map((w) => ({
        t: w.type,
        size: w.size,
        fields: w.fields,
        config: w.config,
      })),
    },
  };
}
```

## Servicio de Sesiones

> **Estado**: la implementación actual vive en `src/renderer/src/lib/session-actions.ts`
> (usa `session-codec` + los handlers IPC `session:*`) y el servicio
> `src/services/session-manager.ts`; el pseudo-código se conserva como referencia.
>
> **Cuándo se puede guardar**: se guarda con los datos capturados hasta el
> momento, sin necesidad de cerrar el puerto Serie. Para no cortar una captura en
> curso, el guardado se **bloquea mientras se reciben datos** (el diálogo explica
> el motivo) y se **habilita** al desconectar o tras **2 s de silencio** desde el
> último dato (`STALE_TRANSMISSION_MS = 2000`). Con el puerto abierto pero sin
> datos, la barra de estado muestra el Serial como **"en reposo"**. Si la sesión
> no se había finalizado, el `TelemetryDataset` se construye al vuelo desde los
> frames capturados (`currentDataset()`).
>
> **Reinicio de transmisión**: al reanudar tras estar **"en reposo"** (silencio
> ≥ `STALE_TRANSMISSION_MS` = 2 s) o al recibir un frame con `t = 0`, se descartan
> los frames anteriores y las gráficas se repintan desde el principio,
> conservando el layout y el schema descubierto (`SerialUARTParser.resetFrames()`).
> Solo afecta al dataset **primario** (`TelemetryStore.clearPrimary()`): en modo
> comparación, la sesión guardada contra la que se compara **no** se resetea.
> El estado del Serial se muestra como **"recibiendo"** mientras llegan datos y
> **"en reposo"** tras el silencio.

```typescript
// src/services/session-manager.ts

import { ipcRenderer } from 'electron';
import type { SessionFile } from '@core/types/session';
import { encodeSession, decodeSession, sessionToDataset, datasetToSession } from '@core/session-codec';
import { telemetryStore } from '@core/telemetry-store';
import { layoutManager } from './layout-manager';

export interface SessionInfo {
  name: string;
  path: string;
  createdAt: string;
}

class SessionManager {
  /**
   * Exporta la sesión actual a una carpeta con JSON + vídeo.
   *
   * @param sessionName - Nombre de la sesión (e.g., "Siguelíneas - Entreno 3")
   * @param videoPath - Ruta al vídeo original
   * @param sync - Configuración de sincronización
   * @param outputDir - Directorio donde crear la carpeta de sesión
   */
  async exportSession(
    sessionName: string,
    videoPath: string,
    sync: { offset_ms: number; anchor: [number, number] | null; rate: number },
    outputDir: string
  ): Promise<string> {
    const dataset = telemetryStore.currentDataset;
    if (!dataset) throw new Error('No telemetry data loaded');

    const layout = layoutManager.getCurrentLayout();
    if (!layout) throw new Error('No layout loaded');

    // Obtener info del vídeo
    const videoInfo = await ipcRenderer.invoke('video:getInfo', videoPath);

    // Construir SessionFile
    const session = datasetToSession(
      dataset,
      { file: videoInfo.filename, ...videoInfo },
      sync,
      { widgets: layout.widgets.map(w => ({
        type: w.type,
        size: [w.width, w.height] as [number, number],
        fields: w.dataFields,
        config: w.config,
      })) }
    );

    // Guardar JSON + copiar vídeo
    const sessionDir = await ipcRenderer.invoke('session:export', sessionName, outputDir, encodeSession(session), videoPath);
    return sessionDir;
  }

  /**
   * Importa una sesión desde un .json.
   * Carga automáticamente vídeo, telemetría, sync y layout.
   */
  async importSession(jsonPath: string): Promise<void> {
    // Leer JSON
    const jsonContent = await ipcRenderer.invoke('session:read', jsonPath);
    const session = decodeSession(jsonContent);

    // Cargar vídeo
    const videoPath = await ipcRenderer.invoke('session:getVideoPath', jsonPath, session.video.file);
    await ipcRenderer.invoke('video:load', videoPath);

    // Convertir y cargar telemetría
    const dataset = sessionToDataset(session);
    telemetryStore.loadDataset(dataset);

    // Aplicar sync
    await ipcRenderer.invoke('sync:setOffset', session.sync.offset_ms);
    if (session.sync.anchor) {
      await ipcRenderer.invoke('sync:setAnchor', session.sync.anchor[0], session.sync.anchor[1]);
    }
    await ipcRenderer.invoke('sync:setRate', session.sync.rate);

    // Cargar layout
    layoutManager.loadLayout({
      version: 1,
      name: session.name,
      createdAt: session.created,
      modifiedAt: session.created,
      videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: true, overlays: [] },
      widgets: session.layout.widgets.map((w, i) => ({
        id: `widget-${i}`,
        type: w.t,
        label: w.t,
        width: w.size[0],
        height: w.size[1],
        dataFields: w.fields,
        config: w.config ?? {},
        visible: true,
      })),
      global: { theme: 'dark', units: { speed: 'rpm', distance: 'm', angle: 'deg' }, showGrid: true, snapToGrid: true, gridSize: 40 },
    });
  }

  /**
   * Lista todas las sesiones guardadas en un directorio.
   */
  async listSessions(directory: string): Promise<SessionInfo[]> {
    return ipcRenderer.invoke('session:list', directory);
  }
}

export const sessionManager = new SessionManager();
```

## Main Process — Handlers de Sesión

```typescript
// src/main/ipc-handlers.ts (añadido)

import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';

// Exportar sesión: crear carpeta + JSON + copiar vídeo
ipcMain.handle('session:export', async (_event, name: string, outputDir: string, jsonContent: string, videoPath: string) => {
  // Crear nombre de carpeta seguro
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sessionDir = join(outputDir, safeName);

  await mkdir(sessionDir, { recursive: true });

  // Guardar JSON
  await writeFile(join(sessionDir, 'session.json'), jsonContent, 'utf-8');

  // Copiar vídeo
  const videoFilename = basename(videoPath);
  await copyFile(videoPath, join(sessionDir, videoFilename));

  return sessionDir;
});

// Leer JSON de sesión
ipcMain.handle('session:read', async (_event, jsonPath: string) => {
  return readFile(jsonPath, 'utf-8');
});

// Obtener ruta del vídeo relativo al JSON
ipcMain.handle('session:getVideoPath', async (_event, jsonPath: string, videoFile: string) => {
  return join(dirname(jsonPath), videoFile);
});

// Listar sesiones en un directorio
ipcMain.handle('session:list', async (_event, directory: string) => {
  const entries = await readdir(directory);
  const sessions: SessionInfo[] = [];

  for (const entry of entries) {
    const jsonPath = join(directory, entry, 'session.json');
    try {
      const s = await stat(jsonPath);
      if (s.isFile()) {
        const content = await readFile(jsonPath, 'utf-8');
        const session = JSON.parse(content);
        sessions.push({
          name: session.name ?? entry,
          path: jsonPath,
          createdAt: session.created ?? s.mtime.toISOString(),
        });
      }
    } catch {
      // No es una sesión válida, ignorar
    }
  }

  return sessions;
});
```
