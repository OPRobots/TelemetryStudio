import type { ITelemetryParser, ParserMetadata } from '../interfaces';
import type {
  TelemetryFrame,
  TelemetryDataset,
  FieldSchema,
  TelemetryValue,
} from '@core/types/telemetry';

/** Metadatos enriquecidos para campos conocidos. */
export const KNOWN_FIELDS: Record<string, Partial<FieldSchema>> = {
  speed_rpm: { unit: 'RPM', label: 'Velocidad' },
  motor_left: { unit: 'PWM', min: -1000, max: 1000, label: 'Motor izq.' },
  motor_right: { unit: 'PWM', min: -1000, max: 1000, label: 'Motor der.' },
  gyro_z: { unit: '°/s', label: 'Giro Z' },
  accX: { unit: 'm/s²', label: 'Acel X' },
  accY: { unit: 'm/s²', label: 'Acel Y' },
  accZ: { unit: 'm/s²', label: 'Acel Z' },
  gyroX: { unit: '°/s', label: 'Giro X' },
  gyroY: { unit: '°/s', label: 'Giro Y' },
  battery: { unit: '%', min: 0, max: 100, label: 'Batería' },
};

/**
 * Nombres de columna por defecto para el formato CSV sin encabezado.
 * Coincide con el firmware STM32 de referencia:
 * `timestamp_ms, accX, accY, accZ, gyroX, gyroY, gyroZ, battery`
 */
export const DEFAULT_CSV_FIELDS = [
  'accX',
  'accY',
  'accZ',
  'gyroX',
  'gyroY',
  'gyroZ',
  'battery',
];

/** Nombres que se interpretan como timestamp en el parser Macroarray. */
export const TIMESTAMP_FIELD_NAMES = new Set(['t', 'time', 'timestamp', 'ts']);

export type ParsedField = [name: string, value: TelemetryValue, hexBits?: number];

export interface ParsedLine {
  fields: ParsedField[];
  /** Timestamp (ms) si el parser lo encontró en la línea/grupo. */
  timestamp?: number;
}

/** Extrae un valor tipado de un token de texto. */
export function parseValue(raw: string): number | boolean | string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16);
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
}

/** Ancho en bits de un literal hex (`0x...`): 4 por dígito. */
export function hexBitWidth(raw: string): number | null {
  const match = /^0x([0-9a-f]+)$/i.exec(raw.trim());
  return match ? match[1]!.length * 4 : null;
}

/**
 * Base común de los parsers Serial UART. Gestiona:
 * - Acumulación de frames y schema descubierto (tipos inferidos del valor).
 * - Modo **timestamp**: si `hasTimestamp`, una línea es un frame con su tiempo.
 * - Modo **grupos** (sin timestamp, o Macroarray): agrupa campos y cierra el
 *   frame cuando el **primer campo del grupo** vuelve a aparecer; el tiempo es
 *   un contador incremental (índice de muestra).
 */
export abstract class SerialParserBase implements ITelemetryParser {
  abstract readonly metadata: ParserMetadata;

  protected frames: TelemetryFrame[] = [];
  protected streamComplete = false;
  protected fieldSchemas = new Map<string, FieldSchema>();
  /** `true` si el parser agrupa varias líneas por frame (Macroarray). */
  protected groupLines = false;

  /** `true` si la primera línea inválida debe rechazar la importación (CSV). */
  get strict(): boolean {
    return false;
  }

  private group: Record<string, TelemetryValue> = {};
  private groupOrder: string[] = [];
  private groupFirstField: string | null = null;
  private sampleIndex = 0;

  constructor(protected hasTimestamp: boolean) {}

  canParse(): boolean {
    return false;
  }

  async parse(): Promise<TelemetryDataset> {
    throw new Error('Serial parser does not support file parsing. Use parseLine() instead.');
  }

  /** Parsea una línea a campos tipados (y timestamp si aplica). */
  protected abstract parseLineFields(line: string): ParsedLine | null;

  parseLine(line: string): TelemetryFrame | null {
    const trimmed = line.trim().replace(/\r$/, '');
    if (trimmed.length === 0) return null;

    const parsed = this.parseLineFields(trimmed);
    if (!parsed) return null;

    if (!this.groupLines) {
      if (parsed.fields.length === 0) return null;
      let ts: number;
      if (this.hasTimestamp) {
        if (parsed.timestamp == null) return null;
        ts = parsed.timestamp;
      } else {
        ts = this.sampleIndex++;
      }
      const data = this.toData(parsed.fields);
      return this.emitFrame(ts, data);
    }

    // Modo grupos: cada línea aporta uno o más campos.
    let closed: TelemetryFrame | null = null;
    for (const [name, value, hexBits] of parsed.fields) {
      if (this.groupFirstField == null) this.groupFirstField = name;
      // El primer campo vuelve a aparecer → se cierra el grupo anterior.
      if (
        name === this.groupFirstField &&
        this.groupOrder.length > 0 &&
        Object.prototype.hasOwnProperty.call(this.group, name)
      ) {
        closed = this.closeGroup();
        this.group = {};
        this.groupOrder = [];
        this.groupFirstField = name;
      }
      this.group[name] = value;
      if (!this.groupOrder.includes(name)) this.groupOrder.push(name);
      this.updateSchema(name, value, hexBits ?? null);
    }
    return closed;
  }

  private closeGroup(): TelemetryFrame | null {
    if (this.groupOrder.length === 0) return null;

    // En modo grupos con timestamp, un campo `t`/`time`/`timestamp` (que suele
    // ser el primero del grupo) aporta el tiempo del frame y no es un dato.
    let tsName: string | null = null;
    if (this.hasTimestamp) {
      tsName =
        this.groupOrder.find(
          (name) => TIMESTAMP_FIELD_NAMES.has(name.toLowerCase()) && typeof this.group[name] === 'number'
        ) ?? null;
    }

    const data: Record<string, TelemetryValue> = {};
    for (const name of this.groupOrder) {
      if (name === tsName) continue;
      data[name] = this.group[name]!;
    }
    const ts = tsName != null ? (this.group[tsName] as number) : this.sampleIndex;
    this.sampleIndex++;
    return this.emitFrame(ts, data);
  }

  private toData(fields: ParsedField[]): Record<string, TelemetryValue> {
    const data: Record<string, TelemetryValue> = {};
    for (const [name, value, hexBits] of fields) {
      data[name] = value;
      this.updateSchema(name, value, hexBits ?? null);
    }
    return data;
  }

  private emitFrame(timestamp_ms: number, data: Record<string, TelemetryValue>): TelemetryFrame {
    const frame: TelemetryFrame = { timestamp_ms, data };
    this.frames.push(frame);
    return frame;
  }

  private updateSchema(name: string, value: TelemetryValue, hexBits: number | null): void {
    const existing = this.fieldSchemas.get(name);
    if (!existing) {
      const known = KNOWN_FIELDS[name] ?? {};
      if (hexBits != null) {
        this.fieldSchemas.set(name, {
          name,
          type: 'bitmask',
          bitmaskWidth: hexBits,
          recommendedWidget: 'bitmask',
          ...known,
        });
      } else if (typeof value === 'string') {
        this.fieldSchemas.set(name, {
          name,
          type: 'string',
          recommendedWidget: 'timeline',
          ...known,
        });
      } else {
        this.fieldSchemas.set(name, {
          name,
          type: typeof value === 'boolean' ? 'boolean' : 'number',
          recommendedWidget: typeof value === 'boolean' ? 'timeline' : 'timeseries',
          ...known,
        });
      }
      return;
    }

    if (hexBits != null && existing.type !== 'bitmask') {
      existing.type = 'bitmask';
      existing.bitmaskWidth = hexBits;
      existing.recommendedWidget = 'bitmask';
    } else if (hexBits != null && existing.type === 'bitmask') {
      existing.bitmaskWidth = Math.max(existing.bitmaskWidth ?? 0, hexBits);
    }
  }

  isStreamComplete(): boolean {
    return this.streamComplete;
  }

  completeStream(): void {
    if (this.groupLines) this.closeGroup();
    this.streamComplete = true;
  }

  getDiscoveredSchema(): FieldSchema[] {
    return Array.from(this.fieldSchemas.values());
  }

  buildDataset(
    name: string,
    source?: { port?: string; baudRate?: number }
  ): TelemetryDataset {
    const frames = [...this.frames];
    frames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const startTime_ms = frames.length > 0 ? frames[0]!.timestamp_ms : 0;
    const endTime_ms = frames.length > 0 ? frames[frames.length - 1]!.timestamp_ms : 0;
    const duration_ms = endTime_ms - startTime_ms;

    return {
      id: `serial-${Date.now()}`,
      name,
      frames,
      schema: this.getDiscoveredSchema(),
      startTime_ms,
      endTime_ms,
      duration_ms,
      avgSampleRate_hz: duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
      frameCount: frames.length,
      source: {
        type: 'serial',
        port: source?.port ?? '',
        baudRate: source?.baudRate ?? 115200,
      },
    };
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** Vacía los frames acumulados conservando schema (reinicio de captura). */
  resetFrames(): void {
    this.frames = [];
    this.streamComplete = false;
    this.group = {};
    this.groupOrder = [];
    this.groupFirstField = null;
    this.sampleIndex = 0;
  }

  destroy(): void {
    this.frames = [];
    this.fieldSchemas.clear();
    this.streamComplete = false;
    this.group = {};
    this.groupOrder = [];
    this.groupFirstField = null;
    this.sampleIndex = 0;
  }
}
