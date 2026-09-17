# Sistema de Plugins

El sistema de plugins permite extender la app sin tocar el core. Hay dos tipos:
**Parsers** (entrada de datos) y **Widgets** (visualización).

> **Serial UART** acepta TRES formatos de línea (timestamp en la primera posición):
>
> | Formato | Ejemplo |
> |---|---|
> | CSV posicional | `1000,1.20,2.30,9.80,10.0,-5.0,0.0,99.5` |
> | Legacy con letras | `T:1234,S:1500,M:512,-510,G:15` |
> | Genérico con claves | `T:1234,speed_rpm:1500,battery:85.5,armed:true` |
>
> En CSV posicional los nombres de columna se configuran con `setCsvFields()`
> (por defecto `accX…battery`, ver `DEFAULT_CSV_FIELDS`). El tipo de cada campo se
> **infiere del valor** y se expone vía `getDiscoveredSchema()`:
> `true`/`false` → `boolean`, decimales → `number`, literales **hexadecimales**
> (`0x...`) → `bitmask` (`bitmaskWidth = 4 × dígitos`) y cualquier otro token sin
> comas → `string` (p. ej. `state:RUNNING`). Un campo que primero llegó como número
> se **asciende** a `bitmask` en cuanto aparece un hex.

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

Ambos parsers producen el mismo `TelemetryDataset`; los widgets no distinguen su origen.

## Parser: JSON Session

`src/parsers/json-session-parser.ts` — lee `session.json` (formato compacto
`schema` + `frames` posicionales) y produce un `TelemetryDataset`. Ver
`docs/14-SESSION-FORMAT.md`.

## Parser: Serial UART (streaming)

`src/parsers/serial-uart-parser.ts`

- `parseLine(line)`: parsea una línea y devuelve un `TelemetryFrame` (o `null`).
- `getDiscoveredSchema()`: campos descubiertos con su tipo.
- `setCsvFields(names)`: nombres de columna para el CSV posicional.
- `resetFrames()`: vacía los frames acumulados **conservando** el schema y los
  nombres CSV (se usa al reiniciar una captura).
- `completeStream()` / `buildDataset(name)`: cierran el stream y construyen el dataset.

## ParserRegistry

`src/parsers/parser-registry.ts` (`parserRegistry` singleton)

```typescript
register(parser); unregister(name); get(name);
getAll(); detectParser(data, filename); getStreamingParsers(); destroyAll();
```

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
  frame: TelemetryFrame | null;
  context: VideoFrameContext | null;
  frames: TelemetryFrame[];
  viewTimestamp_ms?: number | null;
  onCursorHover?: (timestamp_ms: number | null) => void;
  zoomRange?: ZoomRange | null;
  onZoomRangeChange?: (range: ZoomRange | null) => void;
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
2. Registrarlo en `src/parsers/parser-registry.ts` (o donde se inicialicen los parsers).

## Añadir un widget nuevo

1. Crear `src/widgets/mi-widget/index.tsx` exportando una `WidgetDefinition`
   (`{ metadata, component }`).
2. Registrarla en `src/widgets/register-widgets.ts`.
3. `metadata.acceptedFieldTypes` decide para qué tipos de campo se ofrece; el
   `metadata.defaultConfig` se aplica al añadirlo desde el menú.

Ver `docs/08-WIDGET-SYSTEM.md` para el detalle de cada widget.
