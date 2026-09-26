# Sistema de Plugins

La app se extiende con **Parsers** (entrada de datos) y **Widgets** (visualización).
Los widgets se registran en un registro dinámico; los parsers seriales se crean con
una fábrica y las sesiones se cargan por `session-codec`.

> **Serial UART** ofrece tres **parsers** seleccionables al conectar, más la casilla
> "La telemetría incluye timestamp" (1ª columna/campo):
>
> | Parser | Formato | Ejemplo |
> |---|---|---|
> | **Default** | clave:valor con timestamp | `T:1234,speed:1500,battery:85.5,armed:true` |
> | **CSV** | separado por `,`, `;` o espacio (separador y etiquetas configurables) | `1000,1.20,2.30,9.80` |
> | **Macroarray** | un campo por línea con prefijo `>` | `>speed:1500` |
>
> - **Con timestamp**: la 1ª columna/campo es el tiempo (ms).
> - **Sin timestamp**: el tiempo es el **índice de muestra** (0, 1, 2…); los frames se
>   agrupan hasta que se repite el primer campo (útil en Macroarray). En ese caso la app
>   **avisa** de que la sincronización con el vídeo es aproximada.
> - **CSV** valida estrictamente el nº de columnas y el parseo; si la primera línea no
>   cuadra, se **rechaza la importación** con un aviso.
> - El tipo de cada campo se **infiere del valor**: `true`/`false` → `boolean`, decimales
>   → `number`, literales **hexadecimales** (`0x...`) → `bitmask` (`bitmaskWidth = 4 ×
>   dígitos`) y cualquier otro token → `string` (p. ej. `state:RUNNING`). Un campo que
>   primero llegó como número se **asciende** a `bitmask` en cuanto aparece un hex.
> - La configuración elegida (parser, timestamp, separador y etiquetas) se **recuerda**
>   entre sesiones (`settings.json` en `userData`).

---

## Interfaz ITelemetryParser

`src/parsers/interfaces.ts`

```typescript
interface ParserMetadata {
  name: string;
  description: string;
  extensions: string[];
  icon: string;
  supportsStreaming: boolean;
  priority: number;
}

interface ITelemetryParser {
  readonly metadata: ParserMetadata;
  parse(data: ArrayBuffer, filename: string, onProgress?: (percent: number) => void): Promise<TelemetryDataset>;
  canParse(data: ArrayBuffer, filename: string): boolean;
  parseLine?(line: string): TelemetryFrame | null; // streaming
  isStreamComplete?(): boolean;
  getDiscoveredSchema?(): FieldSchema[];
  destroy?(): void;
}
```

Todos los parsers producen el mismo `TelemetryDataset`; los widgets no distinguen su
origen.

> Para los seriales, `parse()` (el método de fichero de `ITelemetryParser`) **lanza**;
> el modo streaming usa `parseLine()` + `completeStream()`/`buildDataset()`.

## Parser: Serial UART (streaming)

`src/parsers/serial/` — base común (`serial-parser-base.ts`) + `key-value-parser.ts`
(Default), `csv-parser.ts`, `macro-array-parser.ts` y la fábrica
`createSerialParser(config)`.

- `parseLine(line)`: parsea una línea y devuelve un `TelemetryFrame` (o `null`).
- `getDiscoveredSchema()`: campos descubiertos con su tipo.
- `resetFrames()`: vacía los frames acumulados **conservando** el schema (reinicio de
  captura).
- `completeStream()` / `buildDataset(name, source?)`: cierran el stream y construyen el
  dataset (la `source` serial se rellena con el puerto/baud reales).
- En modo **sin timestamp**, el tiempo es el **índice de muestra**; el agrupamiento por
  repetición del primer campo solo lo aplica **Macroarray** (`groupLines = true`).
  `Default` y `CSV` emiten un frame por línea.

## Carga de sesiones

Las sesiones **no** se cargan con un parser de fichero: usan
`services/session-manager.ts` + `core/session-codec.ts` (`decodeSession` →
`sessionToDataset`). Ver `docs/14-SESSION-FORMAT.md`.

---

## WidgetDefinition

`src/widgets/interfaces.ts`

```typescript
interface WidgetMetadata {
  name: string;                 // id / nombre corto (p. ej. "TimeSeriesChart")
  displayName: string;          // nombre visible ("Gráfica temporal")
  description: string;
  icon: string;
  category: 'chart' | 'indicator' | 'spatial' | 'temporal';
  acceptedFieldTypes: WidgetFieldType[]; // 'number'|'boolean'|'string'|'array'|'bitmask'
  minSize: { width: number; height: number };
  defaultSize: { width: number; height: number };
  defaultConfig: Record<string, unknown>;
  priority: number;
}

interface WidgetProps {
  widgetId: string;
  config: Record<string, unknown>;
  dataFields: string[];
  /** Dataset actual del panel (se lee en el momento de dibujar). */
  getFrames: () => TelemetryFrame[];
  /** Timestamp bajo el cursor (hover), o `null`. */
  hoverTimestamp_ms?: number | null;
  onCursorHover?: (timestamp_ms: number | null) => void;
  zoomRange?: ZoomRange | null;
  onZoomRangeChange?: (range: ZoomRange | null) => void;
  /** Modo directo (replay): las gráficas avanzan con el vídeo. */
  live?: boolean;
  /** Ventana visible (ms) del modo directo. */
  liveWindowMs?: number;
  /** Multiplicador de grosor de líneas (solo exportación). */
  lineScale?: number;
  /** Si el widget debe pintar su fondo transparente (exportación). */
  transparentBackground?: boolean;
}

interface WidgetDefinition {
  metadata: WidgetMetadata;
  component: ComponentType<WidgetProps>;
}
```

## WidgetRegistry

`src/widgets/widget-registry.ts` (`widgetRegistry` singleton)

```typescript
register(definition); unregister(name); get(name); getMetadata(name);
getAll(); // ordenado por priority
getByCategory(category); getByFieldType(type); getRecommendedFor(type);
destroyAll();
```

`src/widgets/register-widgets.ts` registra los 4 widgets estándar (TimeSeriesChart,
DigitalBitmask, Minimap2D, StateTimeline).

---

## Añadir un parser nuevo

1. Implementar `ITelemetryParser` en `src/parsers/mi-parser.ts`.
2. Conectarlo donde se consuma tu formato. No hay un registro de parsers: los seriales se
   crean con `createSerialParser()` (`src/parsers/serial/index.ts`) y las sesiones se
   cargan por `SessionManager`/`session-codec`.

## Añadir un widget nuevo

1. Crear `src/widgets/mi-widget/index.tsx` exportando una `WidgetDefinition`
   (`{ metadata, component }`).
2. Registrarla en `src/widgets/register-widgets.ts`.
3. `metadata.acceptedFieldTypes` decide para qué tipos de campo se ofrece; el
   `metadata.defaultConfig` se aplica al añadirlo desde el menú.

Ver `docs/08-WIDGET-SYSTEM.md` para el detalle de cada widget.
