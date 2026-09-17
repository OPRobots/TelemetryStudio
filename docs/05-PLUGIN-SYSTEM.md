# Sistema de Plugins

> **Estado de implementación**: los parsers reales viven en `src/parsers/`.
> `SerialUARTParser` acepta TRES formatos de línea (todos con el timestamp en la
> primera posición), lo que permite adaptarse tanto al firmware STM32 de referencia
> como a robots que envíen campos con nombre:
>
> | Formato | Ejemplo |
> |---|---|
> | CSV posicional | `1000,1.20,2.30,9.80,10.0,-5.0,0.0,99.5` |
> | Legacy con letras | `T:1234,S:1500,M:512,-510,G:15` |
> | Genérico con claves | `T:1234,speed_rpm:1500,battery:85.5,armed:true` |
>
> En CSV posicional, los nombres de columna se configuran con
> `setCsvFields()` (por defecto `accX…battery`, ver `DEFAULT_CSV_FIELDS`).
> El tipo de cada campo se infiere del valor y se expone vía
> `getDiscoveredSchema()`, lo que alimenta la auto-configuración de widgets:
> `true`/`false` → `boolean`, decimales → `number`, los literales
> **hexadecimales** (`0x...`) → `bitmask` (con `bitmaskWidth = 4 × nº de
> dígitos`) y cualquier otro token sin comas → `string` (etiquetas de estado,
> p. ej. `state:RUNNING`). Un campo que primero llega como número se **asciende**
> a `bitmask` en cuanto aparece un valor hex. El auto-layout crea entonces un
> `DigitalBitmask` y dimensiona su rejilla al ancho detectado, con **todos los
> bits en una sola fila** (p. ej. `0x001FFE`, 24 bits → 24 columnas × 1 fila).

El sistema de plugins permite extender la aplicación sin modificar el código core. Existen dos tipos de plugins: **Parsers** (entrada de datos) y **Widgets** (visualización).

---

## Interfaz ITelemetryParser

> **Nota importante**: Ambos parsers (`SerialUARTParser` y `JSONSessionParser`) producen el mismo tipo `TelemetryDataset`. Los widgets no distinguen de dónde vienen los datos. Esto permite que un análisis commencie con serial en vivo y se guarde como sesión JSON que puede reabrirse después.
>
> **Flujo serial**: El usuario carga el vídeo primero, luego conecta el serial. El stream de telemetría llega en vivo. Al terminar el stream, los nombres de campos están disponibles para configurar los widgets. El usuario espera a que el stream termine antes de configurar gráficas.

```typescript
// src/parsers/interfaces.ts

/**
 * Metadatos de un parser registrado.
 * Se usa para mostrar información al usuario en el diálogo de importación.
 */
interface ParserMetadata {
  /** Nombre legible del parser */
  name: string;

  /** Descripción corta */
  description: string;

  /** Extensiones de archivo que soporta */
  extensions: string[];

  /** Icono del parser (nombre del icono SVG) */
  icon: string;

  /** Si el parser soporta streaming en vivo */
  supportsStreaming: boolean;

  /** Orden de prioridad en la lista (menor = primero) */
  priority: number;
}

/**
 * Interfaz que todo parser debe implementar.
 * Los parsers transforman datos brutos (archivos, serial) en TelemetryFrame[].
 */
interface ITelemetryParser {
  /** Metadatos del parser para UI */
  readonly metadata: ParserMetadata;

  /**
   * Parsea un archivo completo y devuelve todos los frames.
   * Se ejecuta en un Worker Thread para no bloquear la UI.
   *
   * @param data - ArrayBuffer con los datos brutos del archivo
   * @param filename - Nombre del archivo (para metadata)
   * @param onProgress - Callback de progreso (0-100)
   * @returns Dataset completo con todos los frames parseados
   */
  parse(
    data: ArrayBuffer,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<TelemetryDataset>;

  /**
   * Valida si el archivo puede ser parseado por este parser.
   * Se ejecuta antes de `parse()` para detectar el formato correcto.
   *
   * @param data - Primeros bytes del archivo (mínimo 256 bytes)
   * @param filename - Nombre del archivo
   * @returns true si el parser puede manejar este archivo
   */
  canParse(data: ArrayBuffer, filename: string): boolean;

  /**
   * Opcional: Parsea una sola línea de datos (para modo streaming serial).
   * Solo implementar si metadata.supportsStreaming es true.
   *
   * @param line - Línea de texto recibida del serial
   * @returns TelemetryFrame parseado, o null si la línea no es válida
   */
  parseLine?(line: string): TelemetryFrame | null;

  /**
   * Opcional: Indica si el stream ha terminado y el schema está completo.
   * Cuando retorna true, los nombres de campos están disponibles para
   * que el usuario configure los widgets.
   */
  isStreamComplete?(): boolean;

  /**
   * Opcional: Obtiene el schema de campos descubierto durante el streaming.
   * Solo útil después de que isStreamComplete() retorna true.
   */
  getDiscoveredSchema?(): FieldSchema[];

  /**
   * Opcional: Limpia recursos al destruir el parser.
   */
  destroy?(): void;
}
```

---

## Interfaz ITelemetryWidget

```typescript
// src/widgets/interfaces.ts

/**
 * Metadatos de un widget registrado.
 * Se usa para mostrar el widget en el panel de selección.
 */
interface WidgetMetadata {
  /** Nombre legible del widget */
  name: string;

  /** Descripción corta */
  description: string;

  /** Icono del widget */
  icon: string;

  /** Categoría para agrupación en la UI */
  category: 'chart' | 'indicator' | 'spatial' | 'temporal';

  /** Campos de telemetría que acepta este widget */
  acceptedFieldTypes: Array<'number' | 'boolean' | 'array' | 'bitmask'>;

  /** Tamaño mínimo en el grid (columnas x filas) */
  minSize: { width: number; height: number };

  /** Tamaño por defecto al crear el widget */
  defaultSize: { width: number; height: number };

  /** Configuración por defecto del widget */
  defaultConfig: Record<string, unknown>;

  /** Orden de prioridad en la lista */
  priority: number;
}

/**
 * Interfaz que todo widget debe implementar.
 * Los widgets se renderizan en canvas y se redibujan con cada frame.
 */
interface ITelemetryWidget {
  /** Metadatos del widget para UI */
  readonly metadata: WidgetMetadata;

  /**
   * Inicializa el widget con su canvas y configuración.
   * Se llama una vez al montar el widget.
   *
   * @param canvas - Canvas element para renderizar
   * @param config - Configuración del widget (de WidgetConfig.config)
   */
  initialize(canvas: HTMLCanvasElement, config: Record<string, unknown>): void;

  /**
   * Renderiza el widget para el frame actual.
   * Se llama en cada 'frame:current' del EventBus.
   *
   * @param frame - Frame de telemetría actual
   * @param context - Contexto de reproducción del vídeo
   * @param dataFields - Campos de datos que este widget debe mostrar
   */
  render(
    frame: TelemetryFrame,
    context: VideoFrameContext,
    dataFields: string[]
  ): void;

  /**
   * Actualiza la configuración del widget.
   * Se llama cuando el usuario cambia ajustes del widget.
   *
   * @param config - Nueva configuración parcial
   */
  updateConfig(config: Record<string, unknown>): void;

  /**
   * Actualiza el tamaño del canvas.
   * Se llama cuando el usuario redimensiona el widget.
   *
   * @param width - Nuevo ancho en píxeles
   * @param height - Nuevo alto en píxeles
   */
  resize(width: number, height: number): void;

  /**
   * Captura el canvas actual como ImageBitmap.
   * Se usa para la exportación de vídeo.
   *
   * @returns ImageBitmap del canvas actual
   */
  captureFrame(): Promise<ImageBitmap>;

  /**
   * Limpia recursos al destruir el widget.
   */
  destroy(): void;
}
```

---

## ParserRegistry — Registro Dinámico de Parsers

```typescript
// src/parsers/parser-registry.ts

/**
 * Registro singleton de parsers disponibles.
 * Permite registrar nuevos parsers en tiempo de ejecución.
 */
class ParserRegistry {
  private parsers: Map<string, ITelemetryParser> = new Map();

  /**
   * Registra un parser nuevo en el sistema.
   * El parser se añade automáticamente a la lista de opciones de importación.
   *
   * @param parser - Instancia del parser que implementa ITelemetryParser
   */
  register(parser: ITelemetryParser): void {
    const key = parser.metadata.name;
    if (this.parsers.has(key)) {
      console.warn(`Parser "${key}" already registered. Overwriting.`);
    }
    this.parsers.set(key, parser);
  }

  /**
   * Elimina un parser del registro.
   */
  unregister(name: string): void {
    const parser = this.parsers.get(name);
    if (parser?.destroy) {
      parser.destroy();
    }
    this.parsers.delete(name);
  }

  /**
   * Obtiene un parser por nombre.
   */
  get(name: string): ITelemetryParser | undefined {
    return this.parsers.get(name);
  }

  /**
   * Obtiene todos los parsers registrados, ordenados por prioridad.
   */
  getAll(): ITelemetryParser[] {
    return Array.from(this.parsers.values())
      .sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  /**
   * Detecta qué parser puede manejar un archivo dado.
   * Prueba cada parser en orden de prioridad.
   *
   * @param data - Primeros bytes del archivo
   * @param filename - Nombre del archivo
   * @returns El parser más apropiado, o null si ninguno puede
   */
  detectParser(data: ArrayBuffer, filename: string): ITelemetryParser | null {
    for (const parser of this.getAll()) {
      if (parser.canParse(data, filename)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Obtiene todos los parsers que soportan streaming.
   */
  getStreamingParsers(): ITelemetryParser[] {
    return this.getAll().filter(p => p.metadata.supportsStreaming);
  }

  /**
   * Destruye todos los parsers registrados.
   */
  destroyAll(): void {
    for (const parser of this.parsers.values()) {
      if (parser.destroy) parser.destroy();
    }
    this.parsers.clear();
  }
}

// Singleton global
export const parserRegistry = new ParserRegistry();
```

---

## WidgetRegistry — Registro Dinámico de Widgets

```typescript
// src/widgets/widget-registry.ts

/**
 * Registro singleton de widgets disponibles.
 * Permite registrar nuevos widgets en tiempo de ejecución.
 */
class WidgetRegistry {
  private widgets: Map<string, {
    metadata: WidgetMetadata;
    factory: () => ITelemetryWidget;
  }> = new Map();

  /**
   * Registra un widget nuevo en el sistema.
   *
   * @param metadata - Metadatos del widget
   * @param factory - Función factory que crea una instancia nueva del widget
   */
  register(
    metadata: WidgetMetadata,
    factory: () => ITelemetryWidget
  ): void {
    if (this.widgets.has(metadata.name)) {
      console.warn(`Widget "${metadata.name}" already registered. Overwriting.`);
    }
    this.widgets.set(metadata.name, { metadata, factory });
  }

  /**
   * Elimina un widget del registro.
   */
  unregister(name: string): void {
    this.widgets.delete(name);
  }

  /**
   * Crea una instancia nueva de un widget por nombre.
   */
  create(name: string): ITelemetryWidget | null {
    const entry = this.widgets.get(name);
    if (!entry) return null;
    return entry.factory();
  }

  /**
   * Obtiene los metadatos de un widget.
   */
  getMetadata(name: string): WidgetMetadata | undefined {
    return this.widgets.get(name)?.metadata;
  }

  /**
   * Obtiene todos los widgets registrados, ordenados por prioridad.
   */
  getAll(): Array<{ metadata: WidgetMetadata; factory: () => ITelemetryWidget }> {
    return Array.from(this.widgets.values())
      .sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  /**
   * Obtiene widgets filtrados por categoría.
   */
  getByCategory(category: WidgetMetadata['category']): Array<{
    metadata: WidgetMetadata;
    factory: () => ITelemetryWidget;
  }> {
    return this.getAll().filter(w => w.metadata.category === category);
  }

  /**
   * Obtiene widgets que aceptan un tipo de campo específico.
   */
  getByFieldType(fieldType: 'number' | 'boolean' | 'array' | 'bitmask'): Array<{
    metadata: WidgetMetadata;
    factory: () => ITelemetryWidget;
  }> {
    return this.getAll().filter(w => w.metadata.acceptedFieldTypes.includes(fieldType));
  }
}

// Singleton global
export const widgetRegistry = new WidgetRegistry();
```

---

## Ejemplo: Registrar un Parser Nuevo sin Tocar el Core

### Parser: JSON Session

```typescript
// src/parsers/json-session-parser.ts — Archivo completamente nuevo

import type { ITelemetryParser, ParserMetadata } from './interfaces';
import type { TelemetryFrame, TelemetryDataset } from '@core/types/telemetry';

class JSONSessionParser implements ITelemetryParser {
  readonly metadata: ParserMetadata = {
    name: 'JSON Session',
    description: 'Loads telemetry from an OPRobots session (.json compact format)',
    extensions: ['.json'],
    icon: 'folder-open',
    supportsStreaming: false,
    priority: 10,
  };

  canParse(data: ArrayBuffer, filename: string): boolean {
    if (!filename.endsWith('.json')) return false;
    try {
      const text = new TextDecoder().decode(data.slice(0, 512));
      const raw = JSON.parse(text);
      return raw.v === 1 && Array.isArray(raw.telemetry?.frames);
    } catch {
      return false;
    }
  }

  async parse(
    data: ArrayBuffer,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<TelemetryDataset> {
    const text = new TextDecoder().decode(data);
    const raw = JSON.parse(text);

    const { schema, frames } = raw.telemetry;

    const fieldSchemas = schema.map((s: any[]) => {
      const [name, type] = s;
      const base: any = { name, type };
      if (type === 'number') {
        if (s[2]) base.unit = s[2];
        if (s[3] != null) base.min = s[3];
        if (s[4] != null) base.max = s[4];
      } else if (type === 'bitmask') {
        base.bitmaskWidth = s[2];
      }
      return base;
    });

    const fieldNames = fieldSchemas.map((s: any) => s.name);

    const telemetryFrames: TelemetryFrame[] = frames.map((frame: number[]) => {
      const [timestamp_ms, ...values] = frame;
      const data: Record<string, any> = {};
      fieldNames.forEach((name: string, i: number) => {
        data[name] = values[i] ?? null;
      });
      return { timestamp_ms, data };
    });

    onProgress?.(100);

    return {
      id: crypto.randomUUID(),
      name: raw.name ?? filename,
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
      source: { type: 'session', sessionName: raw.name ?? filename, path: filename },
    };
  }
}

// ─── Registro ───
import { parserRegistry } from './parser-registry';
parserRegistry.register(new JSONSessionParser());
```

### Parser: Serial UART (Streaming)

```typescript
// src/parsers/serial-uart-parser.ts — Archivo completamente nuevo

import type { ITelemetryParser, ParserMetadata } from './interfaces';
import type { TelemetryFrame } from '@core/types/telemetry';

class SerialUARTParser implements ITelemetryParser {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART',
    description: 'Parses live telemetry from a serial UART stream (printf format)',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 10,
  };

  canParse(_data: ArrayBuffer, _filename: string): boolean {
    return false; // Solo streaming, no archivos
  }

  async parse(): Promise<any> {
    throw new Error('Serial parser does not support file parsing. Use parseLine() instead.');
  }

  /**
   * Parsea una línea de telemetría del serial.
   * Formato: T:<ms>,S:<speed>,M:<left>,<right>,G:<gyro>
   */
  parseLine(line: string): TelemetryFrame | null {
    try {
      const match = line.match(/^T:(\d+),S:(-?\d+),M:(-?\d+),(-?\d+),G:(-?\d+)/);
      if (!match) return null;

      return {
        timestamp_ms: parseInt(match[1], 10),
        data: {
          speed_rpm: parseInt(match[2], 10),
          motor_left: parseInt(match[3], 10),
          motor_right: parseInt(match[4], 10),
          gyro_z: parseInt(match[5], 10),
        },
      };
    } catch {
      return null;
    }
  }
}

// ─── Registro ───
import { parserRegistry } from './parser-registry';
parserRegistry.register(new SerialUARTParser());
```

**Resultado**: Ambos parsers aparecen automáticamente en la app. El JSON Session carga sesiones guardadas. El Serial UART parsea datos en vivo. Ningún archivo core fue modificado.

---

## Ejemplo: Registrar un Widget Nuevo sin Tocar el Core

```typescript
// src/widgets/battery-indicator/index.tsx — Archivo completamente nuevo

import type { ITelemetryWidget, WidgetMetadata } from '../interfaces';
import type { TelemetryFrame, VideoFrameContext } from '@core/types/telemetry';

class BatteryIndicatorWidget implements ITelemetryWidget {
  readonly metadata: WidgetMetadata = {
    name: 'Battery Indicator',
    description: 'Shows battery voltage as a colored bar',
    icon: 'battery',
    category: 'indicator',
    acceptedFieldTypes: ['number'],
    minSize: { width: 2, height: 1 },
    defaultSize: { width: 4, height: 2 },
    defaultConfig: {
      lowThreshold: 3.3,
      criticalThreshold: 3.0,
      maxVoltage: 4.2,
    },
    priority: 50,
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: Record<string, unknown> = {};

  initialize(canvas: HTMLCanvasElement, config: Record<string, unknown>): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...this.metadata.defaultConfig, ...config };
  }

  render(
    frame: TelemetryFrame,
    _context: VideoFrameContext,
    dataFields: string[]
  ): void {
    if (!this.ctx || !this.canvas) return;

    const field = dataFields[0];
    if (!field) return;

    const voltage = frame.data[field] as number;
    if (voltage == null) return;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    // Calculate fill
    const maxV = this.config.maxVoltage as number;
    const ratio = Math.max(0, Math.min(1, voltage / maxV));

    // Color based on voltage
    const low = this.config.lowThreshold as number;
    const crit = this.config.criticalThreshold as number;
    let color = '#4ade80'; // green
    if (voltage <= crit) color = '#ef4444'; // red
    else if (voltage <= low) color = '#facc15'; // yellow

    // Draw bar
    const barWidth = (width - 20) * ratio;
    ctx.fillStyle = color;
    ctx.fillRect(10, height / 2 - 10, barWidth, 20);

    // Draw text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.min(14, height / 3)}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${voltage.toFixed(2)}V`, width / 2, height / 2 + 5);
  }

  updateConfig(config: Record<string, unknown>): void {
    this.config = { ...this.config, ...config };
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.canvas) throw new Error('Widget not initialized');
    return createImageBitmap(this.canvas);
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}

// ─── Registro ───
import { widgetRegistry } from '../widget-registry';
widgetRegistry.register(
  BatteryIndicatorWidget.prototype.metadata,
  () => new BatteryIndicatorWidget()
);
```

```typescript
// Importar en el entry point del renderer
import '@widgets/battery-indicator';
```

**Resultado**: El widget "Battery Indicator" aparece en el panel de selección de widgets. Ningún archivo core fue modificado.
